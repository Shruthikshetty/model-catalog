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
 * Shape of a raw model object returned by Cohere's `/v1/models` endpoint.
 * Documentation: https://docs.cohere.com/reference/list-models
 * API Reference: https://api.cohere.com/v1/models
 */
export type CohereRawModel = {
  name: string;
  endpoints?: string[];
  finetuned?: boolean;
  context_length?: number;
  tokenizer_url?: string | null;
  features?: string[] | null;
  default_endpoints?: string[];
  is_deprecated?: boolean;
  [key: string]: unknown;
};

type CohereModelsResponse = {
  models?: CohereRawModel[];
  next_page_token?: string;
};

// functions ---------------------------------

/**
 * Fetches all models from Cohere API, handling pagination if present
 */
export async function fetchCohereModels(): Promise<CohereRawModel[]> {
  const models: CohereRawModel[] = [];
  let pageToken: string | undefined = undefined;

  do {
    const query = new globalThis.URL(URL.COHERE_MODELS);
    query.searchParams.set("page_size", "1000");
    if (pageToken) {
      query.searchParams.set("page_token", pageToken);
    }

    const response = await fetch(query.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.COHERE_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch models from Cohere API (${response.status}): ${errorText}`,
      );
    }

    const json = (await response.json()) as CohereModelsResponse;
    if (json.models) {
      models.push(...json.models);
    }

    pageToken = json.next_page_token;
  } while (pageToken);

  return models;
}

/**
 * Main generator that fetches Cohere models, filters out fine-tunes,
 * and hydrates capabilities and token limits via native metadata and LiteLLM.
 */
export async function getCohereCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchCohereModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    // Filter out fine-tuned variants
    if (raw.finetuned) {
      continue;
    }

    const modelId = raw.name;
    const endpoints = raw.endpoints || [];
    const features = raw.features || [];
    const lite = await getLiteLlmModelDetails(modelId, "cohere");

    const isTranscription = endpoints.includes("transcriptions");
    const isImageEmbedding = endpoints.includes("embed_image");
    const isEmbedding =
      endpoints.includes("embed") ||
      isImageEmbedding ||
      lite?.mode === "embedding";
    const isRerank = endpoints.includes("rerank");
    const isChat =
      endpoints.includes("chat") ||
      (!isEmbedding && !isTranscription && !isRerank);

    const isVision =
      features.includes("vision") ||
      Boolean(lite?.supports_vision);

    const isReasoning =
      features.includes("reasoning") ||
      Boolean(lite?.supports_reasoning);

    const hasTools =
      features.includes("tools") ||
      features.includes("strict_tools") ||
      Boolean(lite?.supports_function_calling);

    const hasWebSearch =
      features.includes("citations") ||
      Boolean(lite?.supports_web_search);

    // Inputs determination
    const inputs: Modality[] = [];
    if (isTranscription) {
      inputs.push("audio");
    } else if (isImageEmbedding) {
      inputs.push("image");
    } else {
      inputs.push("text");
      if (isVision) inputs.push("image");
    }

    // Outputs determination
    const outputs: Modality[] = isEmbedding ? ["embedding"] : ["text"];

    // Descriptive tags
    const tags: string[] = [];
    if (isEmbedding) tags.push("embedding");
    if (isImageEmbedding) tags.push("image");
    if (isTranscription) tags.push("audio", "stt");
    if (isRerank) tags.push("rerank");
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");
    if (hasWebSearch) tags.push("search");
    if (isChat) tags.push("chat");

    const catalogModel: CatalogModel = {
      provider_id: "cohere",
      id: modelId,
      canonical_id: `cohere/${modelId}`,
      name: cleanDisplayName(modelId),
      origin_provider: "cohere",
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: hasWebSearch,
        codeExecution: false,
        realtime: false,
        videoReasoning: false,
        fileInput: Boolean(lite?.supports_pdf_input),
        supportsStreaming: !isEmbedding,
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
        raw.context_length && raw.context_length > 0
          ? raw.context_length
          : lite?.max_input_tokens ?? lite?.max_tokens ?? null,
      max_output_tokens: lite?.max_output_tokens ?? null,
      description: null,
      tags,
      is_deprecated: raw.is_deprecated ?? false,
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
