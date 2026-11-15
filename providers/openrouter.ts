import { URL } from "../constants";
import env from "../env";
import {
  CatalogModelSchema,
  type CatalogModel,
  type Modality,
  type ReasoningEffortLevel,
} from "../types";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------
// Source: https://openrouter.ai/docs/api-reference/models/get-models
export interface OpenRouterRawArchitecture {
  modality?: string | null;
  input_modalities?: string[] | null;
  output_modalities?: string[] | null;
  tokenizer?: string | null;
  instruct_type?: string | null;
}

export interface OpenRouterRawTopProvider {
  context_length?: number | null;
  max_completion_tokens?: number | null;
  is_moderated?: boolean | null;
}

export interface OpenRouterRawPerRequestLimits {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
}

export interface OpenRouterRawReasoning {
  mandatory?: boolean | null;
  default_enabled?: boolean | null;
  supported_efforts?: string[] | null;
  default_effort?: string | null;
}

/**
 * Shape of a raw model object returned by OpenRouter's `/api/v1/models` endpoint.
 * Documentation: https://openrouter.ai/docs/api-reference/models/get-models
 */
export type OpenRouterRawModel = {
  id: string;
  name?: string | null;
  description?: string | null;
  context_length?: number | null;
  architecture?: OpenRouterRawArchitecture | null;
  top_provider?: OpenRouterRawTopProvider | null;
  per_request_limits?: OpenRouterRawPerRequestLimits | null;
  supported_parameters?: string[] | null;
  supported_voices?: string[] | null;
  expiration_date?: string | null;
  endpoints?: string[] | null;
  reasoning?: OpenRouterRawReasoning | null;
};

export type OpenRouterModelsResponse = {
  data: OpenRouterRawModel[];
};

// constants ---------------------------------
const KNOWN_MODALITIES: Set<string> = new Set([
  "text",
  "image",
  "audio",
  "video",
  "file",
  "embedding",
]);

const KNOWN_EFFORT_LEVELS: Set<string> = new Set([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

// utils -------------------------------------
export function isKnownModality(mod: string): mod is Modality {
  return KNOWN_MODALITIES.has(mod);
}

export function isKnownEffortLevel(
  level: string,
): level is ReasoningEffortLevel {
  return KNOWN_EFFORT_LEVELS.has(level);
}

// functions ---------------------------------
export async function fetchOpenRouterModels(): Promise<OpenRouterRawModel[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (env.OPENROUTER_API_KEY) {
    headers["Authorization"] = `Bearer ${env.OPENROUTER_API_KEY}`;
  }

  const response = await fetch(URL.OPENROUTER_MODELS, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from OpenRouter API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as OpenRouterModelsResponse;
  return json.data || [];
}

/**
 * Main generator that fetches OpenRouter models and transforms them into
 * fully typed CatalogModel entries directly from the OpenRouter API metadata.
 */
export async function getOpenRouterCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchOpenRouterModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;

    // Resolve inputs and outputs from architecture metadata
    const rawInputs = raw.architecture?.input_modalities || ["text"];
    const rawOutputs = raw.architecture?.output_modalities || ["text"];

    const inputs: Modality[] = rawInputs.filter(isKnownModality);
    const outputs: Modality[] = rawOutputs.filter(isKnownModality);

    if (inputs.length === 0) inputs.push("text");
    if (outputs.length === 0) outputs.push("text");

    const isImage = outputs.includes("image");
    const isVideo = outputs.includes("video");
    const isAudioOutput = outputs.includes("audio");
    const isAudioInput = inputs.includes("audio");
    const isVision = inputs.includes("image");
    const isVideoReasoning = inputs.includes("video");
    const hasFileInput = inputs.includes("file");

    const hasTools = Boolean(raw.supported_parameters?.includes("tools"));
    const webSearch = Boolean(
      raw.supported_parameters?.includes("web_search_options"),
    );

    // Resolve reasoning configuration
    const rawEfforts = raw.reasoning?.supported_efforts;
    const hasReasonParam = Boolean(
      raw.supported_parameters?.some((p) => p.includes("reason")),
    );
    const isReasoning = Boolean(raw.reasoning || hasReasonParam);

    let reasoningType: "effort" | "budget" | "toggle" | "fixed" | null = null;
    let effortLevels: ReasoningEffortLevel[] | null = null;

    if (isReasoning) {
      if (rawEfforts && rawEfforts.length > 0) {
        reasoningType = "effort";
        effortLevels = rawEfforts.filter(isKnownEffortLevel);
      } else if (raw.reasoning?.mandatory) {
        reasoningType = "fixed";
      } else {
        reasoningType = "toggle";
      }
    }

    const canToggleOff = isReasoning ? !raw.reasoning?.mandatory : true;
    const defaultState = isReasoning
      ? raw.reasoning?.default_enabled
        ? "enabled"
        : raw.reasoning?.mandatory
          ? "enabled"
          : "disabled"
      : "disabled";

    // Tags
    const tags: string[] = [];
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");
    if (isImage) tags.push("image");
    if (isVideo) tags.push("video");
    if (isAudioOutput) tags.push("audio", "tts");
    if (isAudioInput) tags.push("audio", "stt");
    if (webSearch) tags.push("search");
    if (!isImage && !isVideo && !isAudioOutput) tags.push("chat");

    const originProvider = modelId.split("/")[0] || "openrouter";

    const catalogModel: CatalogModel = {
      provider_id: "openrouter",
      id: modelId,
      canonical_id: `openrouter/${modelId}`,
      name: raw.name?.trim() || cleanDisplayName(modelId),
      origin_provider: originProvider,
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch,
        codeExecution: false,
        realtime: false,
        videoReasoning: isVideoReasoning,
        fileInput: hasFileInput,
        supportsStreaming: !isImage && !isVideo,
        supportsSystemPrompt: true,
        reasoning: {
          supported: isReasoning,
          type: reasoningType,
          effort_levels: effortLevels,
          budget_tokens: null,
          can_toggle_off: canToggleOff,
          default_state: defaultState,
        },
      },
      image_options: null,
      tts_options: null,
      video_options: null,
      context_length:
        raw.context_length ?? raw.top_provider?.context_length ?? null,
      max_output_tokens:
        raw.top_provider?.max_completion_tokens ??
        raw.per_request_limits?.completion_tokens ??
        null,
      description: raw.description ?? null,
      tags,
      is_deprecated: raw.expiration_date
        ? new Date(raw.expiration_date) <= new Date()
        : false,
    };

    const validated = CatalogModelSchema.parse(catalogModel);
    catalogModels.push(validated);
  }

  return catalogModels;
}
