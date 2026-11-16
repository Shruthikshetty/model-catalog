import env from "../env";
import { URL } from "../constants";
import { type CatalogModel, type Modality } from "../types";
import { getLiteLlmModelDetails } from "../utils/litellm";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------

/**
 * Shape of raw model response from Fireworks AI
 * Source: https://docs.fireworks.ai/api-reference/models-list
 * API Reference: https://docs.fireworks.ai/api-reference/introduction
 */
export type FireworksModelKind =
  | "HF_BASE_MODEL"
  | "EMBEDDING_MODEL"
  | "ROUTER"
  | string;

export type FireworksRawModel = {
  id: string;
  object?: string;
  owned_by?: string;
  created?: number;
  kind?: FireworksModelKind;
  supports_chat?: boolean;
  supports_image_input?: boolean;
  supports_tools?: boolean;
  context_length?: number;
  [key: string]: unknown;
};

type FireworksModelsResponse = {
  data?: FireworksRawModel[];
};

// utils -------------------------------------

function extractOriginProvider(slug: string, fallback?: string): string {
  const lower = slug.toLowerCase();
  if (lower.startsWith("glm")) return "zhipu";
  if (lower.startsWith("minimax")) return "minimax";
  if (lower.startsWith("qwen")) return "qwen";
  if (lower.startsWith("kimi")) return "moonshot";
  if (lower.startsWith("deepseek")) return "deepseek";
  if (lower.startsWith("nemotron")) return "nvidia";
  if (lower.startsWith("gpt-oss")) return "openai";
  if (lower.startsWith("llama")) return "meta";
  if (lower.startsWith("mistral")) return "mistral";
  return fallback || "fireworks";
}

// functions ---------------------------------

/**
 * Function to fetch the raw models list from Fireworks AI
 */
export async function fetchFireworksModels(): Promise<FireworksRawModel[]> {
  const response = await fetch(URL.FIREWORKS_MODELS, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.FIREWORKS_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from Fireworks AI (${response.status}): ${errorText}`,
    );
  }

  const json = await response.json();
  if (Array.isArray(json)) {
    return json as FireworksRawModel[];
  }
  return (json as FireworksModelsResponse).data || [];
}

/**
 * Main generator that fetches Fireworks AI models, prioritizes Fireworks native metadata,
 * and hydrates capabilities and token limits using LiteLLM.
 */
export async function getFireworksCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchFireworksModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    const slug = modelId.split("/").pop() || modelId;
    const lite = await getLiteLlmModelDetails(modelId, "fireworks_ai");

    const isEmbedding =
      raw.kind === "EMBEDDING_MODEL" || lite?.mode === "embedding";

    const isVision = Boolean(raw.supports_image_input ?? lite?.supports_vision);

    const hasTools = Boolean(
      raw.supports_tools ?? lite?.supports_function_calling,
    );

    const isReasoning = Boolean(lite?.supports_reasoning);

    // Inputs and Outputs determination
    const inputs: Modality[] = ["text"];
    const outputs: Modality[] = ["text"];

    if (isVision) {
      inputs.push("image");
    }

    if (isEmbedding) {
      outputs.length = 0;
      outputs.push("embedding");
    }

    // Descriptive tags
    const tags: string[] = [];
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");
    if (isEmbedding) tags.push("embedding");
    if (!isEmbedding) tags.push("chat");
    if (raw.kind === "ROUTER" || modelId.includes("/routers/")) {
      tags.push("router");
    }

    const catalogModel: CatalogModel = {
      providerId: "fireworks",
      id: modelId,
      canonicalId: `fireworks/${modelId}`,
      name: cleanDisplayName(slug),
      originProvider: extractOriginProvider(slug, lite?.litellm_provider),
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
        supportsStreaming: !isEmbedding,
        supportsSystemPrompt: lite?.supports_system_messages ?? true,
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? "effort" : null,
          effortLevels: isReasoning ? ["low", "medium", "high"] : null,
          budgetTokens: null,
          canToggleOff: false,
          defaultState: isReasoning ? "enabled" : "disabled",
        },
      },
      imageOptions: null,
      ttsOptions: null,
      videoOptions: null,
      contextLength:
        raw.context_length ??
        lite?.max_input_tokens ??
        lite?.max_tokens ??
        null,
      maxOutputTokens: lite?.max_output_tokens ?? null,
      description: null,
      tags,
      isDeprecated: lite?.deprecation_date
        ? new Date(lite.deprecation_date) <= new Date()
        : false,
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
