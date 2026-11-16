import env from "../env";
import { URL } from "../constants";
import { getLiteLlmModelDetails } from "../utils/litellm";
import { cleanDisplayName } from "../utils/format";
import {
  CatalogModelSchema,
  type CatalogModel,
  type ImageOptions,
  type Modality,
  type TtsOptions,
  type TtsVoice,
} from "../types";

// types -------------------------------------
export type OpenAiRawModel = {
  id: string;
  object: string;
  created: number;
  owned_by: string;
};

type OpenAiModelsResponse = {
  object: string;
  data: OpenAiRawModel[];
};

// constants ---------------------------------
export const EXCLUDED_MODEL_PREFIXES = [
  "babbage",
  "davinci",
  "curie",
  "ada",
  "canary",
  "ft:",
  "whisper-internal",
  "text-search",
  "text-similarity",
] as const;

// OpenAI Text-to-Speech voices
// Source: https://platform.openai.com/docs/guides/text-to-speech#voice-options
// API Reference: https://platform.openai.com/docs/api-reference/audio/createSpeech
export const OPENAI_TTS_VOICES: TtsVoice[] = [
  { id: "alloy", label: "Alloy", gender: null },
  { id: "ash", label: "Ash", gender: null },
  { id: "ballad", label: "Ballad", gender: null },
  { id: "coral", label: "Coral", gender: null },
  { id: "echo", label: "Echo", gender: null },
  { id: "fable", label: "Fable", gender: null },
  { id: "nova", label: "Nova", gender: null },
  { id: "onyx", label: "Onyx", gender: null },
  { id: "sage", label: "Sage", gender: null },
  { id: "shimmer", label: "Shimmer", gender: null },
  { id: "verse", label: "Verse", gender: null },
  { id: "marin", label: "Marin", gender: null },
  { id: "cedar", label: "Cedar", gender: null },
];

// Source: https://platform.openai.com/docs/api-reference/audio/createSpeech#audio-createspeech-response_format
export const OPENAI_TTS_FORMATS = ["mp3", "opus", "aac", "flac", "wav", "pcm"];

// OpenAI image generation options
// Source: https://platform.openai.com/docs/guides/images/usage
// API Reference: https://platform.openai.com/docs/api-reference/images/create
export const OPENAI_IMAGE_OPTIONS: ImageOptions = {
  sizes: ["1024x1024", "1024x1792", "1792x1024", "512x512", "256x256"],
  aspect_ratios: ["1:1", "9:16", "16:9"],
  qualities: ["standard", "hd"],
  styles: ["vivid", "natural"],
  supports_seed: false,
  provider_param_key: "openai",
};

export const OPENAI_TTS_OPTIONS: TtsOptions = {
  voices: OPENAI_TTS_VOICES,
  formats: OPENAI_TTS_FORMATS,
  speeds: { min: 0.25, max: 4.0 },
};

// utils -------------------------------------
export function isCanonicalOpenAiModel(id: string): boolean {
  // Exclude dated snapshots: e.g. -2024-05-13, -2024-08-06, -0613, -0314, -0125, -1106
  if (/-\d{4}-\d{2}-\d{2}$/.test(id)) return false;
  if (/-\d{4}$/.test(id)) return false;

  // Exclude legacy completion models & internal checkpoints
  if (EXCLUDED_MODEL_PREFIXES.some((prefix) => id.startsWith(prefix))) {
    return false;
  }

  // Exclude audio transcription / diarization internal variants if any
  if (id.includes("-internal-")) return false;

  return true;
}

// functions ---------------------------------
export async function fetchOpenAiModels(): Promise<OpenAiRawModel[]> {
  // fetch models from open ai
  const response = await fetch(URL.OPENAI_MODELS, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  // if failed
  if (!response.ok) {
    const errorText = await response.text();
    // throw error
    throw new Error(
      `Failed to fetch models from OpenAI API (${response.status}): ${errorText}`,
    );
  }

  // wait for the json response
  const json = (await response.json()) as OpenAiModelsResponse;

  // apply the required filters
  return json.data.filter((model) => isCanonicalOpenAiModel(model.id));
}

/**
 * Main generator that fetches OpenAI models and hydrates them with LiteLLM data
 * to produce fully typed CatalogModel entries without hardcoded model name checks.
 */
export async function getOpenAiCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchOpenAiModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    const lite = await getLiteLlmModelDetails(modelId, "openai");

    // Purely metadata-driven modality categorization
    const mode = lite?.mode ?? "chat";
    const isImage = mode === "image_generation";
    const isTts = mode === "audio_speech";
    const isWhisper = mode === "audio_transcription";
    const isEmbedding = mode === "embedding";
    const isRealtime = mode === "realtime";

    const isVision = Boolean(lite?.supports_vision);
    const isReasoning = Boolean(lite?.supports_reasoning);
    const hasTools = Boolean(
      lite?.supports_function_calling ?? (!isImage && !isTts && !isEmbedding),
    );
    const hasFileInput = Boolean(lite?.supports_pdf_input);

    // Build inputs and outputs directly from metadata
    const inputs: Modality[] = ["text"];
    const outputs: Modality[] = ["text"];

    if (isVision) inputs.push("image");
    if (hasFileInput) inputs.push("file");

    if (isWhisper) {
      inputs.length = 0;
      inputs.push("audio");
    }

    if (isImage) {
      outputs.length = 0;
      outputs.push("image");
    } else if (isTts) {
      outputs.length = 0;
      outputs.push("audio");
    } else if (isEmbedding) {
      outputs.length = 0;
      outputs.push("embedding");
    }

    // Build descriptive tags
    const tags: string[] = [];
    if (isImage) tags.push("image");
    if (isTts) tags.push("tts", "audio");
    if (isWhisper) tags.push("audio", "stt");
    if (isEmbedding) tags.push("embedding");
    if (isReasoning) tags.push("reasoning");
    if (isVision) tags.push("vision");
    if (!isImage && !isTts && !isEmbedding && !isWhisper) tags.push("chat");

    const catalogModel: CatalogModel = {
      provider_id: "openai",
      id: modelId,
      canonical_id: `openai/${modelId}`,
      name: cleanDisplayName(modelId),
      origin_provider: "openai",
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: false,
        codeExecution: false,
        realtime: isRealtime,
        videoReasoning: false,
        fileInput: hasFileInput,
        supportsStreaming: !isImage && !isEmbedding,
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
      image_options: isImage ? OPENAI_IMAGE_OPTIONS : null,
      tts_options: isTts ? OPENAI_TTS_OPTIONS : null,
      video_options: null,
      context_length: lite?.max_input_tokens ?? lite?.max_tokens ?? null,
      max_output_tokens: lite?.max_output_tokens ?? null,
      description: null,
      tags,
      is_deprecated: lite?.deprecation_date
        ? new Date(lite.deprecation_date) <= new Date()
        : false,
    };

    // Validate against our schema
    const validated = CatalogModelSchema.parse(catalogModel);
    catalogModels.push(validated);
  }

  return catalogModels;
}
