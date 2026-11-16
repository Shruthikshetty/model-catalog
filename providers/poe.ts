import { URL } from "../constants";
import {
  type CatalogModel,
  type Modality,
  type ReasoningEffortLevel,
} from "../types";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------

/**
 * Shape of architecture specifications returned by Poe's model endpoint.
 * Defines input/output modalities (e.g. text, image, video).
 */
export type PoeRawArchitecture = {
  input_modalities?: string[];
  output_modalities?: string[];
  modality?: string;
};

/**
 * Token limits and context window configuration for a Poe model.
 */
export type PoeRawContextWindow = {
  context_length?: number;
  max_output_tokens?: number | null;
};

/**
 * Pricing rates per token or request from Poe API.
 */
export type PoeRawPricing = {
  prompt?: string;
  completion?: string;
  image?: string | null;
  request?: string | null;
  input_cache_read?: string | null;
  input_cache_write?: string | null;
};

/**
 * Model parameters and configurable options (such as reasoning effort and web search).
 */
export type PoeRawParameter = {
  name: string;
  schema?: {
    type?: string;
    enum?: string[];
  };
  default_value?: unknown;
  description?: string;
};

/**
 * Display metadata, avatar image, and URL references for a Poe bot.
 */
export type PoeRawMetadata = {
  display_name?: string;
  image?: {
    url?: string;
    alt?: string;
    width?: number;
    height?: number;
  };
  url?: string;
};

/**
 * Reasoning capabilities and token budget constraints.
 */
export type PoeRawReasoning = {
  budget?: number | null;
  required?: boolean;
  supports_reasoning_effort?: boolean;
};

/**
 * Shape of a raw model object returned by Poe's `/v1/models` endpoint.
 * API Reference: https://api.poe.com/v1/models
 * Key Management: https://poe.com/api/keys
 */
export type PoeRawModel = {
  id: string;
  object?: string;
  created?: number;
  description?: string | null;
  owned_by?: string;
  root?: string;
  architecture?: PoeRawArchitecture;
  supported_features?: string[];
  supported_endpoints?: string[];
  pricing?: PoeRawPricing | null;
  context_window?: PoeRawContextWindow;
  context_length?: number;
  metadata?: PoeRawMetadata;
  reasoning?: PoeRawReasoning | null;
  parameters?: PoeRawParameter[];
};

type PoeModelsResponse = {
  object?: string;
  data: PoeRawModel[];
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

function isKnownModality(mod: string): mod is Modality {
  return KNOWN_MODALITIES.has(mod);
}

function isKnownEffortLevel(level: string): level is ReasoningEffortLevel {
  return KNOWN_EFFORT_LEVELS.has(level);
}

// functions ---------------------------------

/**
 * Fetches the raw model list from Poe API
 */
export async function fetchPoeModels(): Promise<PoeRawModel[]> {
  const response = await fetch(URL.POE_MODELS, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from Poe API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as PoeModelsResponse;
  return json.data || [];
}

/**
 * Main generator that fetches Poe models, filters strictly to text-generation models,
 * and standardizes them into CatalogModel entries.
 */
export async function getPoeCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchPoeModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;

    // Filter strictly to text models (output modality must be purely text)
    const rawOutputs = raw.architecture?.output_modalities || [];
    const isTextOnly = rawOutputs.length === 1 && rawOutputs[0] === "text";
    if (!isTextOnly) {
      continue;
    }

    const rawInputs = raw.architecture?.input_modalities || ["text"];
    const inputs: Modality[] = rawInputs.filter(isKnownModality);
    if (inputs.length === 0) inputs.push("text");

    const isVision = inputs.includes("image");
    const hasVideoReasoning = inputs.includes("video");
    const hasTools = Boolean(raw.supported_features?.includes("tools"));
    const hasWebSearch = Boolean(
      raw.supported_features?.includes("web_search"),
    );

    // Extract reasoning parameters if present
    const reasoningParam = raw.parameters?.find(
      (p) => p.name === "reasoning_effort" || p.name === "thinking_level",
    );
    const isReasoning = Boolean(
      raw.reasoning?.supports_reasoning_effort || reasoningParam,
    );
    const effortLevels =
      reasoningParam?.schema?.enum?.filter(isKnownEffortLevel) ||
      (isReasoning ? ["low", "medium", "high"] : null);

    // Build tags
    const tags: string[] = ["chat"];
    if (isVision) tags.push("vision");
    if (hasVideoReasoning) tags.push("video");
    if (hasTools) tags.push("tools");
    if (hasWebSearch) tags.push("web-search");
    if (isReasoning) tags.push("reasoning");
    if (inputs.includes("audio")) tags.push("audio");

    const catalogModel: CatalogModel = {
      providerId: "poe",
      id: modelId,
      canonicalId: `poe/${modelId}`,
      name: raw.metadata?.display_name || cleanDisplayName(modelId),
      originProvider: raw.owned_by?.toLowerCase().trim() || "poe",
      inputs,
      outputs: ["text"],
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: hasWebSearch,
        codeExecution: false,
        realtime: false,
        videoReasoning: hasVideoReasoning,
        fileInput: inputs.includes("file"),
        supportsStreaming: true,
        supportsSystemPrompt: true,
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? "effort" : null,
          effortLevels: isReasoning ? effortLevels : null,
          budgetTokens: null,
          canToggleOff: true,
          defaultState: isReasoning ? "enabled" : "disabled",
        },
      },
      imageOptions: null,
      ttsOptions: null,
      videoOptions: null,
      contextLength:
        raw.context_length ?? raw.context_window?.context_length ?? null,
      maxOutputTokens: raw.context_window?.max_output_tokens ?? null,
      description: raw.description ?? null,
      tags,
      isDeprecated: false,
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
