import env from "../env";
import { URL } from "../constants";
import {
  type CatalogModel,
  type Modality,
} from "../types";
import { getLiteLlmModelDetails } from "../utils/litellm";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------

export type MistralCapabilities = {
  completion_chat?: boolean;
  completion_fim?: boolean;
  function_calling?: boolean;
  fine_tuning?: boolean;
  vision?: boolean;
  ocr?: boolean;
  classification?: boolean;
  moderation?: boolean;
  audio?: boolean;
  audio_transcription?: boolean;
  audio_transcription_realtime?: boolean;
  audio_speech?: boolean;
  reasoning?: boolean;
  unified_resources?: boolean;
  [key: string]: unknown;
};

/**
 * Shape of raw model object returned by Mistral AI's `/v1/models` endpoint.
 * Source: https://docs.mistral.ai/api/#tag/models
 * API Reference: https://docs.mistral.ai/getting-started/models/
 */
export type MistralRawModel = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  name?: string | null;
  description?: string | null;
  max_context_length?: number;
  aliases?: string[];
  deprecation?: string | null;
  deprecation_replacement_model?: string | null;
  default_model_temperature?: number | null;
  type?: "base" | "fine-tuned" | string;
  capabilities?: MistralCapabilities;
  [key: string]: unknown;
};

type MistralModelsResponse = {
  object?: string;
  data: MistralRawModel[];
};

// functions ---------------------------------

/**
 * Fetches the raw models list from Mistral AI
 */
export async function fetchMistralModels(): Promise<MistralRawModel[]> {
  const response = await fetch(URL.MISTRAL_MODELS, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from Mistral AI API (${response.status}): ${errorText}`,
    );
  }

  const json = await response.json();
  if (Array.isArray(json)) {
    return json as MistralRawModel[];
  }
  return (json as MistralModelsResponse).data || [];
}

/**
 * Main generator that fetches Mistral models, prioritizes Mistral's native capabilities,
 * hydrates missing token limits with LiteLLM, and returns CatalogModel entries.
 */
export async function getMistralCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchMistralModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    // Exclude custom user fine-tuned models
    if (raw.type === "fine-tuned" || raw.id.startsWith("ft:")) {
      continue;
    }

    const modelId = raw.id;
    const lite = await getLiteLlmModelDetails(modelId, "mistral");

    const isEmbedding =
      raw.capabilities?.completion_chat === false &&
      (modelId.includes("embed") || lite?.mode === "embedding");
    const isVision = Boolean(raw.capabilities?.vision || lite?.supports_vision);
    const hasTools = Boolean(
      raw.capabilities?.function_calling || lite?.supports_function_calling,
    );
    const isReasoning = Boolean(
      raw.capabilities?.reasoning || lite?.supports_reasoning,
    );
    const hasAudioInput = Boolean(
      raw.capabilities?.audio || raw.capabilities?.audio_transcription,
    );
    const isAudioOutput = Boolean(raw.capabilities?.audio_speech);
    const isRealtime = Boolean(raw.capabilities?.audio_transcription_realtime);

    // Inputs determination
    const inputs: Modality[] = ["text"];
    if (isVision) inputs.push("image");
    if (hasAudioInput) inputs.push("audio");
    if (lite?.supports_pdf_input) inputs.push("file");

    // Outputs determination
    const outputs: Modality[] = ["text"];
    if (isEmbedding) {
      outputs.length = 0;
      outputs.push("embedding");
    } else if (isAudioOutput) {
      outputs.length = 0;
      outputs.push("audio");
    }

    // Descriptive tags
    const tags: string[] = [];
    if (isEmbedding) tags.push("embedding");
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");
    if (hasAudioInput || isAudioOutput) tags.push("audio");
    if (modelId.includes("code") || modelId.includes("codestral")) tags.push("code");
    if (!isEmbedding && !isAudioOutput) tags.push("chat");

    const catalogModel: CatalogModel = {
      provider_id: "mistral",
      id: modelId,
      canonical_id: `mistral/${modelId}`,
      name: raw.name || cleanDisplayName(modelId),
      origin_provider: raw.owned_by?.toLowerCase().trim() || "mistral",
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: false,
        codeExecution: false,
        realtime: isRealtime,
        videoReasoning: false,
        fileInput: Boolean(lite?.supports_pdf_input),
        supportsStreaming: raw.capabilities?.completion_chat ?? true,
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
        raw.max_context_length ??
        lite?.max_input_tokens ??
        lite?.max_tokens ??
        null,
      max_output_tokens: lite?.max_output_tokens ?? null,
      description: raw.description ?? null,
      tags,
      is_deprecated: Boolean(
        (raw.deprecation && new Date(raw.deprecation) <= new Date()) ||
          (lite?.deprecation_date && new Date(lite.deprecation_date) <= new Date()),
      ),
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
