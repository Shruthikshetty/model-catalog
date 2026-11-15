import env from "../env";
import { URL } from "../constants";
import {
  type CatalogModel,
  type Modality,
} from "../types";
import { getLiteLlmModelDetails } from "../utils/litellm";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------

/**
 * Shape of a raw model object returned by Cerebras API's `/v1/models` endpoint.
 * Source: https://inference-docs.cerebras.ai/
 * API Reference: https://api.cerebras.ai/v1/models
 */
export type CerebrasRawModel = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  [key: string]: unknown;
};

type CerebrasModelsResponse = {
  object?: string;
  data: CerebrasRawModel[];
};

// utils -------------------------------------

function extractOriginProvider(modelId: string, fallback?: string): string {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("gpt-oss")) return "openai";
  if (lower.startsWith("qwen")) return "alibaba";
  if (lower.startsWith("llama")) return "meta";
  if (lower.startsWith("mistral")) return "mistral";
  if (lower.startsWith("deepseek")) return "deepseek";
  return fallback || "cerebras";
}

// functions ---------------------------------

/**
 * Fetches the raw models list from Cerebras Inference API
 */
export async function fetchCerebrasModels(): Promise<CerebrasRawModel[]> {
  const response = await fetch(URL.CEREBRAS_MODELS, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.CEREBRAS_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from Cerebras API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as CerebrasModelsResponse;
  return json.data || [];
}

/**
 * Main generator that fetches Cerebras models, hydrates capabilities and token limits
 * via LiteLLM, and returns typed CatalogModel entries.
 */
export async function getCerebrasCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchCerebrasModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    const lite = await getLiteLlmModelDetails(modelId, "cerebras");

    const isVision = Boolean(lite?.supports_vision);
    const hasTools = Boolean(lite?.supports_function_calling ?? true);
    const isReasoning = Boolean(lite?.supports_reasoning);

    const inputs: Modality[] = ["text"];
    if (isVision) inputs.push("image");

    const outputs: Modality[] = ["text"];

    const tags: string[] = ["chat"];
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");

    const catalogModel: CatalogModel = {
      provider_id: "cerebras",
      id: modelId,
      canonical_id: `cerebras/${modelId}`,
      name: cleanDisplayName(modelId),
      origin_provider: extractOriginProvider(
        modelId,
        raw.owned_by?.toLowerCase().trim() || "cerebras",
      ),
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: false,
        codeExecution: false,
        realtime: false,
        videoReasoning: false,
        fileInput: false,
        supportsStreaming: true,
        supportsSystemPrompt: lite?.supports_system_messages ?? true,
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? "effort" : null,
          effort_levels: isReasoning ? ["low", "medium", "high"] : null,
          budget_tokens: null,
          can_toggle_off: true,
          default_state: isReasoning ? "enabled" : "disabled",
        },
      },
      image_options: null,
      tts_options: null,
      video_options: null,
      context_length:
        lite?.max_input_tokens ??
        lite?.max_tokens ??
        null,
      max_output_tokens: lite?.max_output_tokens ?? null,
      description: null,
      tags,
      is_deprecated: false,
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
