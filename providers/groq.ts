import env from "../env";
import { URL } from "../constants";
import { type CatalogModel, type Modality } from "../types";
import { getLiteLlmModelDetails } from "../utils/litellm";
import { cleanDisplayName } from "../utils/format";

// types --------------------

export type GroqPricing = {
  prompt?: string;
  completion?: string;
  input_cache_read?: string;
  image?: string;
};

/**
 * shape of response from groq models list
 * https://console.groq.com/docs/api-reference#models-retrieve
 */
export type GroqModel = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  active: boolean;
  context_window: number;
  max_completion_tokens?: number;
  name?: string;
  input_modalities?: string[]; // ["text", "audio", "image"]
  output_modalities?: string[]; // ["transcription", "text", "speech"]
  context_length?: number;
  max_output_length?: number;
  pricing?: GroqPricing;
  supported_sampling_parameters?: string[]; // ["temperature", "top_p", "stop", "seed", "max_tokens"]
  supported_features?: string[]; // ["tools", "json_mode", "structured_outputs", "reasoning"]
};

type GroqModelResponse = {
  data: GroqModel[];
};

// helpers ------------------

function mapGroqModality(m: string): Modality | null {
  if (m === "text" || m === "transcription") return "text";
  if (m === "speech" || m === "audio") return "audio";
  if (m === "image") return "image";
  if (m === "video") return "video";
  return null;
}

// functions --------------

/**
 * function to fetch the models from groq
 */
export async function fetchGroqModels(): Promise<GroqModel[]> {
  // fetch the models
  const response = await fetch(URL.GROQ_MODELS, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from Groq API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as GroqModelResponse;
  return json.data || [];
}

/**
 * Main generator that fetches Groq models, prioritizes Groq's live metadata,
 * and falls back to LiteLLM whenever fields are missing.
 */
export async function getGroqCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchGroqModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    const lite = await getLiteLlmModelDetails(modelId, "groq");

    // Inputs & Outputs
    const inputs: Modality[] = raw.input_modalities
      ? (raw.input_modalities
          .map(mapGroqModality)
          .filter(Boolean) as Modality[])
      : ((lite?.supported_modalities as Modality[]) ?? ["text"]);

    const outputs: Modality[] = raw.output_modalities
      ? (raw.output_modalities
          .map(mapGroqModality)
          .filter(Boolean) as Modality[])
      : ((lite?.supported_output_modalities as Modality[]) ?? ["text"]);

    // Capabilities (Groq first -> LiteLLM fallback)
    const isVision =
      raw.input_modalities?.includes("image") ??
      Boolean(lite?.supports_vision ?? modelId.includes("vision"));

    const hasTools =
      raw.supported_features?.includes("tools") ??
      Boolean(lite?.supports_function_calling);

    const isReasoning =
      raw.supported_features?.includes("reasoning") ??
      Boolean(lite?.supports_reasoning);

    const isAudio =
      inputs.includes("audio") ||
      outputs.includes("audio") ||
      lite?.mode === "audio_transcription";

    // Descriptive tags
    const tags: string[] = [];
    if (isVision) tags.push("vision");
    if (isAudio) tags.push("audio");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");
    if (!isAudio) tags.push("chat");

    const catalogModel: CatalogModel = {
      provider_id: "groq",
      id: modelId,
      canonical_id: `groq/${modelId}`,
      name: raw.name || cleanDisplayName(modelId),
      origin_provider:
        raw.owned_by?.toLowerCase() || lite?.litellm_provider || "groq",
      inputs: inputs.length > 0 ? inputs : ["text"],
      outputs: outputs.length > 0 ? outputs : ["text"],
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: false,
        codeExecution: false,
        realtime: false,
        videoReasoning: false,
        fileInput: false,
        supportsStreaming:
          !outputs.includes("audio") &&
          !raw.output_modalities?.includes("transcription"),
        supportsSystemPrompt: lite?.supports_system_messages ?? true,
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? "effort" : null,
          effort_levels: isReasoning ? ["low", "medium", "high"] : null,
          budget_tokens: null,
          can_toggle_off: false,
          default_state: isReasoning ? "enabled" : "disabled",
        },
      },
      image_options: null,
      tts_options: null,
      video_options: null,
      context_length:
        raw.context_length ??
        raw.context_window ??
        lite?.max_input_tokens ??
        lite?.max_tokens ??
        null,
      max_output_tokens:
        raw.max_output_length ??
        raw.max_completion_tokens ??
        lite?.max_output_tokens ??
        null,
      description: null,
      tags,
      is_deprecated:
        raw.active === false ||
        (lite?.deprecation_date
          ? new Date(lite.deprecation_date) <= new Date()
          : false),
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
