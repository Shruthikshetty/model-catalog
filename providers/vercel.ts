import { URL } from "../constants";
import { cleanDisplayName } from "../utils/format";
import {
  CatalogModelSchema,
  type CatalogModel,
  type Modality,
  type ReasoningEffortLevel,
} from "../types";

// types -------------------------------------
export interface VercelRawModalities {
  input?: string[];
  output?: string[];
}

export interface VercelRawReasoningOption {
  type: string; // "effort" | "budget_tokens" | "toggle"
  values?: string[];
  min?: number;
  max?: number;
}

export interface VercelRawPricing {
  input?: string;
  output?: string;
  [key: string]: unknown;
}

/**
 * Shape of a raw model object returned by Vercel's `/v1/models` endpoint.
 * Documentation: https://ai-gateway.vercel.sh/v1/models
 * Reference: https://vercel.com/docs/ai-gateway
 */
export interface VercelRawModel {
  id: string; // e.g. "openai/gpt-4o", "alibaba/qwen-3-14b"
  object?: string;
  name?: string;
  description?: string;
  owned_by?: string;
  context_window?: number;
  max_tokens?: number;
  type?: string; // "language" | "embedding" | "video" | "image" | "speech" | "realtime"
  modalities?: VercelRawModalities;
  supported_parameters?: string[];
  reasoning_options?: VercelRawReasoningOption[];
  tags?: string[];
  pricing?: VercelRawPricing;
  [key: string]: unknown;
}

interface VercelModelsResponse {
  object?: string;
  data: VercelRawModel[];
}

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
export async function fetchVercelModels(): Promise<VercelRawModel[]> {
  const response = await fetch(URL.VERCEL_MODELS, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "model-catalog/1.0",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from Vercel AI Gateway API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as VercelModelsResponse;
  return json.data || [];
}

/**
 * Main generator that fetches models from Vercel AI Gateway and maps them
 * directly to typed CatalogModel entries. Vercel provides self-contained
 * metadata (modalities, token limits, reasoning options, tags).
 */
export async function getVercelCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchVercelModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    const isEmbedding = raw.type === "embedding";
    const isImage = raw.type === "image";
    const isVideo = raw.type === "video";
    const isRealtime =
      raw.type === "realtime" ||
      Boolean(raw.tags?.includes("websocket-speech"));

    // Normalize modalities: Vercel uses "pdf" for document files
    const rawInputs = (raw.modalities?.input || ["text"]).map((m) =>
      m === "pdf" ? "file" : m,
    );
    const rawOutputs = isEmbedding
      ? ["embedding"]
      : raw.modalities?.output || ["text"];

    const inputs: Modality[] = rawInputs.filter(isKnownModality);
    if (inputs.length === 0) inputs.push("text");

    const outputs: Modality[] = rawOutputs.filter(isKnownModality);
    if (outputs.length === 0) outputs.push(isEmbedding ? "embedding" : "text");

    const isVision = inputs.includes("image");
    const hasVideoReasoning = inputs.includes("video");
    const hasFileInput = inputs.includes("file");
    const hasTools = Boolean(raw.supported_parameters?.includes("tools"));
    const hasWebSearch = Boolean(raw.tags?.includes("web-search"));

    // Reasoning extraction
    const reasoningOpt = raw.reasoning_options?.[0];
    const isReasoning = Boolean(reasoningOpt);

    let reasoningType: "effort" | "budget" | "toggle" | null = null;
    let effortLevels: ReasoningEffortLevel[] | null = null;
    let budgetTokens: { min: number; max: number; default: number } | null =
      null;

    if (reasoningOpt) {
      if (reasoningOpt.type === "budget_tokens") {
        reasoningType = "budget";
        const minBudget = reasoningOpt.min ?? 1;
        const maxBudget = reasoningOpt.max ?? raw.max_tokens ?? 65536;
        budgetTokens = {
          min: minBudget,
          max: maxBudget,
          default: Math.min(maxBudget, Math.max(minBudget, 4096)),
        };
      } else if (reasoningOpt.type === "effort") {
        reasoningType = "effort";
        if (reasoningOpt.values) {
          effortLevels = reasoningOpt.values.filter(isKnownEffortLevel);
        }
      } else if (reasoningOpt.type === "toggle") {
        reasoningType = "toggle";
      }
    }

    // Build tags
    const tags: string[] = Array.from(new Set(raw.tags || []));
    if (isEmbedding && !tags.includes("embedding")) tags.push("embedding");
    if (isImage && !tags.includes("image")) tags.push("image");
    if (isVideo && !tags.includes("video")) tags.push("video");
    if (isReasoning && !tags.includes("reasoning")) tags.push("reasoning");
    if (isVision && !tags.includes("vision")) tags.push("vision");
    if (!isEmbedding && !isImage && !isVideo && !tags.includes("chat"))
      tags.push("chat");

    const originProvider = raw.owned_by || modelId.split("/")[0] || "unknown";

    const catalogModel: CatalogModel = {
      provider_id: "vercel",
      id: modelId,
      canonical_id: `vercel/${modelId}`,
      name: raw.name || cleanDisplayName(modelId),
      origin_provider: originProvider,
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: hasWebSearch,
        codeExecution: false,
        realtime: isRealtime,
        videoReasoning: hasVideoReasoning,
        fileInput: hasFileInput,
        supportsStreaming: !isEmbedding && !isImage,
        supportsSystemPrompt: true,
        reasoning: {
          supported: isReasoning,
          type: reasoningType,
          effort_levels: effortLevels,
          budget_tokens: budgetTokens,
          can_toggle_off: true,
          default_state: isReasoning ? "enabled" : "disabled",
        },
      },
      image_options: null,
      tts_options: null,
      video_options: null,
      context_length: raw.context_window ?? null,
      max_output_tokens: raw.max_tokens ?? null,
      description: raw.description || null,
      tags,
      is_deprecated: false,
    };

    const validated = CatalogModelSchema.parse(catalogModel);
    catalogModels.push(validated);
  }

  return catalogModels;
}
