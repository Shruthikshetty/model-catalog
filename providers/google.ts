import env from "../env";
import { URL } from "../constants";
import { getLiteLlmModelDetails } from "../utils/litellm";
import { cleanDisplayName } from "../utils/format";
import {
  CatalogModelSchema,
  type CatalogModel,
  type ImageOptions,
  type Modality,
} from "../types";

// types -------------------------------------
/**
 * Shape of a raw model object returned by Google AI Studio's `/v1beta/models` endpoint.
 * Documentation: https://ai.google.dev/api/models#Method:-models.list
 * Reference: https://ai.google.dev/gemini-api/docs/models/gemini
 */
export type GoogleRawModel = {
  name: string; // e.g. "models/gemini-1.5-pro"
  baseModelId?: string;
  version?: string;
  displayName?: string;
  description?: string;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
  supportedGenerationMethods?: string[];
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTemperature?: number;
};

type GoogleModelsResponse = {
  models?: GoogleRawModel[];
};

// constants ---------------------------------
// Source: https://ai.google.dev/gemini-api/docs/imagen
// API Reference: https://ai.google.dev/api/predict
export const GOOGLE_IMAGE_OPTIONS: ImageOptions = {
  sizes: ["1024x1024"],
  aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
  qualities: ["standard"],
  styles: null,
  supportsSeed: true,
  providerParamKey: "google",
};

// Exclude legacy tuning checkpoints or obsolete embeddings if any
export const EXCLUDED_GOOGLE_PREFIXES = [
  "tunedModels/",
  "models/embedding-gecko",
] as const;

// utils -------------------------------------
export function isCanonicalGoogleModel(rawName: string): boolean {
  if (EXCLUDED_GOOGLE_PREFIXES.some((prefix) => rawName.startsWith(prefix))) {
    return false;
  }

  const id = rawName.replace(/^models\//, "");

  // Exclude dated preview snapshots: e.g. -preview-10-2025, -04-2026, -2024-05-13
  if (/-\d{2}-\d{4}$/.test(id)) return false;
  if (/-\d{4}-\d{2}-\d{2}$/.test(id)) return false;

  return true;
}

// functions ---------------------------------
export async function fetchGoogleModels(): Promise<GoogleRawModel[]> {
  const endpoint = `${URL.GOOGLE_MODELS}?key=${encodeURIComponent(env.GEMINI_API_KEY)}&pageSize=1000`;

  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from Google AI Studio API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as GoogleModelsResponse;
  const models = json.models || [];
  return models.filter((m) => isCanonicalGoogleModel(m.name));
}

/**
 * Main generator that fetches Google AI Studio models and hydrates them with LiteLLM data
 * to produce fully typed CatalogModel entries
 */
export async function getGoogleCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchGoogleModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.name.replace(/^models\//, ""); // remove the model prefix
    const lite = await getLiteLlmModelDetails(modelId, "gemini");

    const mode = lite?.mode ?? "chat";
    const isImage = mode === "image_generation";
    const isEmbedding = mode === "embedding";
    const isRealtime = mode === "realtime";

    const isVision = Boolean(lite?.supports_vision);
    const isReasoning = Boolean(lite?.supports_reasoning);
    const hasTools = Boolean(
      lite?.supports_function_calling ?? (!isImage && !isEmbedding),
    );
    const hasFileInput = Boolean(lite?.supports_pdf_input);
    const hasAudio = Boolean(lite?.supported_modalities?.includes("audio"));
    const hasVideo = Boolean(lite?.supported_modalities?.includes("video"));

    // Build inputs and outputs directly from metadata
    const inputs: Modality[] = ["text"];
    const outputs: Modality[] = ["text"];

    if (isVision) inputs.push("image");
    if (hasAudio) inputs.push("audio");
    if (hasVideo) inputs.push("video");
    if (hasFileInput) inputs.push("file");

    if (isImage) {
      outputs.length = 0;
      outputs.push("image");
    } else if (isEmbedding) {
      outputs.length = 0;
      outputs.push("embedding");
    }

    // Build descriptive tags
    const tags: string[] = [];
    if (isImage) tags.push("image");
    if (isEmbedding) tags.push("embedding");
    if (isReasoning) tags.push("reasoning");
    if (isVision) tags.push("vision");
    if (inputs.includes("audio")) tags.push("audio");
    if (inputs.includes("video")) tags.push("video");
    if (!isImage && !isEmbedding) tags.push("chat");

    const catalogModel: CatalogModel = {
      providerId: "google",
      id: modelId,
      canonicalId: `google/${modelId}`,
      name: raw.displayName || cleanDisplayName(modelId),
      originProvider: "google",
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: Boolean(lite?.supports_web_search),
        codeExecution: hasTools && !isEmbedding && !isImage,
        realtime: isRealtime,
        videoReasoning: hasVideo,
        fileInput: hasFileInput,
        supportsStreaming: !isEmbedding && !isImage,
        supportsSystemPrompt: lite?.supports_system_messages ?? true,
        // Gemini Thinking / Reasoning Config (Source: https://ai.google.dev/gemini-api/docs/thinking)
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? "budget" : null,
          effortLevels: null,
          budgetTokens: isReasoning
            ? {
                min: 0,
                max: 65536,
                default: 8192,
              }
            : null,
          canToggleOff: true,
          defaultState: isReasoning ? "enabled" : "disabled",
        },
      },
      imageOptions: isImage ? GOOGLE_IMAGE_OPTIONS : null,
      ttsOptions: null,
      videoOptions: null,
      contextLength:
        raw.inputTokenLimit ??
        lite?.max_input_tokens ??
        lite?.max_tokens ??
        null,
      maxOutputTokens:
        raw.outputTokenLimit ?? lite?.max_output_tokens ?? null,
      description: raw.description || null,
      tags,
      isDeprecated: lite?.deprecation_date
        ? new Date(lite.deprecation_date) <= new Date()
        : false,
    };

    // Validate against our schema
    const validated = CatalogModelSchema.parse(catalogModel);
    catalogModels.push(validated);
  }

  return catalogModels;
}
