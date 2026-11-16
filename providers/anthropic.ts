import env from "../env";
import { URL } from "../constants";
import {
  type CatalogModel,
  type Modality,
  type ReasoningEffortLevel,
} from "../types";
import { getLiteLlmModelDetails } from "../utils/litellm";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------

/**
 * Shape of a raw model object from Anthropic API.
 * Endpoint: https://api.anthropic.com/v1/models
 */
export type AnthropicRawModel = {
  type: "model";
  id: string;
  display_name?: string;
  created_at?: string;
  line?: string;
  max_input_tokens?: number | null;
  max_tokens?: number | null;
  capabilities?: {
    image_input?: { supported?: boolean };
    pdf_input?: { supported?: boolean };
    code_execution?: { supported?: boolean };
    citations?: { supported?: boolean };
    batch?: { supported?: boolean };
    structured_outputs?: { supported?: boolean };
    context_management?: { supported?: boolean };
    thinking?: {
      supported?: boolean;
      types?: Record<string, { supported?: boolean }>;
    };
    effort?: {
      supported?: boolean;
      low?: { supported?: boolean };
      medium?: { supported?: boolean };
      high?: { supported?: boolean };
      xhigh?: { supported?: boolean };
      max?: { supported?: boolean };
    };
    server_tools?: {
      supported?: boolean;
      code_execution?: { supported?: boolean };
      web_search?: { supported?: boolean };
    };
    [key: string]: unknown;
  };
  lifecycle?: string;
  deprecated_at?: string | null;
  retires_at?: string | null;
  [key: string]: unknown;
};

type AnthropicModelsResponse = {
  data: AnthropicRawModel[];
  has_more?: boolean;
  first_id?: string | null;
  last_id?: string | null;
};

// functions ---------------------------------

/**
 * Fetches all available models from Anthropic API with cursor-based pagination.
 */
export async function fetchAnthropicModels(): Promise<AnthropicRawModel[]> {
  const allModels: AnthropicRawModel[] = [];
  let afterId: string | null = null;

  while (true) {
    const url = new globalThis.URL(URL.ANTHROPIC_MODELS);
    if (afterId) {
      url.searchParams.set("after_id", afterId);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch models from Anthropic API (${response.status}): ${errorText}`,
      );
    }

    const json = (await response.json()) as AnthropicModelsResponse;
    const models = json.data || [];

    if (models.length === 0) {
      break;
    }

    allModels.push(...models);

    if (!json.has_more || !json.last_id) {
      break;
    }

    afterId = json.last_id;
  }

  return allModels;
}

/**
 * Main generator that fetches Anthropic models, normalizes native capabilities,
 * enriches missing metadata via LiteLLM, and returns typed CatalogModel entries.
 */
export async function getAnthropicCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchAnthropicModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    const lite = await getLiteLlmModelDetails(modelId, "anthropic");

    const caps = raw.capabilities || {};

    const isVision =
      Boolean(caps.image_input?.supported) ||
      Boolean(lite?.supports_vision);

    const hasPdf =
      Boolean(caps.pdf_input?.supported) ||
      Boolean(lite?.supports_pdf_input);

    const hasCodeExecution = Boolean(
      caps.code_execution?.supported ||
      caps.server_tools?.code_execution?.supported,
    );

    const hasWebSearch = Boolean(
      caps.server_tools?.web_search?.supported ||
      lite?.supports_web_search,
    );

    const hasTools =
      Boolean(caps.structured_outputs?.supported) ||
      Boolean(lite?.supports_function_calling ?? true);

    const isReasoning =
      Boolean(caps.thinking?.supported) ||
      Boolean(lite?.supports_reasoning);

    const hasEffort = Boolean(caps.effort?.supported);

    const inputs: Modality[] = ["text"];
    if (isVision) inputs.push("image");
    if (hasPdf) inputs.push("file");

    const outputs: Modality[] = ["text"];

    const tags: string[] = ["chat"];
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");

    const isDeprecated =
      raw.lifecycle === "deprecated" ||
      Boolean(raw.deprecated_at);

    const effortLevels: ReasoningEffortLevel[] = [];
    if (hasEffort && caps.effort) {
      if (caps.effort.low?.supported) effortLevels.push("low");
      if (caps.effort.medium?.supported) effortLevels.push("medium");
      if (caps.effort.high?.supported) effortLevels.push("high");
      if (caps.effort.xhigh?.supported) effortLevels.push("xhigh");
      if (caps.effort.max?.supported) effortLevels.push("max");
    }

    const contextLength =
      raw.max_input_tokens ??
      lite?.max_input_tokens ??
      lite?.max_tokens ??
      null;

    const maxOutputTokens =
      raw.max_tokens ??
      lite?.max_output_tokens ??
      null;

    const catalogModel: CatalogModel = {
      provider_id: "anthropic",
      id: modelId,
      canonical_id: `anthropic/${modelId}`,
      name: raw.display_name || cleanDisplayName(modelId),
      origin_provider: "anthropic",
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: hasWebSearch,
        codeExecution: hasCodeExecution,
        realtime: false,
        videoReasoning: false,
        fileInput: hasPdf,
        supportsStreaming: true,
        supportsSystemPrompt: lite?.supports_system_messages ?? true,
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? (hasEffort ? "effort" : "budget") : null,
          effort_levels: effortLevels.length > 0 ? effortLevels : (isReasoning ? ["low", "medium", "high"] : null),
          budget_tokens: null,
          can_toggle_off: true,
          default_state: isReasoning ? "enabled" : "disabled",
        },
      },
      image_options: null,
      tts_options: null,
      video_options: null,
      context_length: contextLength,
      max_output_tokens: maxOutputTokens,
      description: null,
      tags,
      is_deprecated: isDeprecated,
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
