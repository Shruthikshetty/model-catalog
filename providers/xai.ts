import env from "../env";
import { URL } from "../constants";
import { getLiteLlmModelDetails } from "../utils/litellm";
import { cleanDisplayName } from "../utils/format";
import {
  CatalogModelSchema,
  type CatalogModel,
  type ImageOptions,
  type Modality,
  type ReasoningEffortLevel,
  type VideoOptions,
} from "../types";

// types -------------------------------------
export interface XAiRawModel {
  id: string;
  context_length?: number;
  object?: string;
  owned_by?: string;
  capabilities?: {
    reasoning_effort?: string[];
    default_reasoning_effort?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface XAiModelsResponse {
  data: XAiRawModel[];
}

// constants ---------------------------------
// Source: https://docs.x.ai/docs/guides/image-generation
export const XAI_IMAGE_OPTIONS: ImageOptions = {
  sizes: ["1024x1024"],
  aspect_ratios: ["1:1", "16:9", "9:16"],
  qualities: ["standard"],
  styles: null,
  supports_seed: true,
  provider_param_key: "xai",
};

// Source: https://docs.x.ai/docs/guides/video-generation
export const XAI_VIDEO_OPTIONS: VideoOptions = {
  durations: [5, 10],
  aspect_ratios: ["16:9", "9:16", "1:1"],
  resolutions: ["720p", "1080p"],
  default_duration: 5,
  default_aspect_ratio: "16:9",
  default_resolution: "720p",
};

// functions ---------------------------------
export async function fetchXAiModels(): Promise<XAiRawModel[]> {
  const response = await fetch(URL.XAI_MODELS, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.XAI_API_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from xAI API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as XAiModelsResponse;
  return json.data || [];
}

/**
 * Main generator that fetches xAI models and hydrates them with LiteLLM data
 * to produce fully typed CatalogModel entries.
 */
export async function getXAiCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchXAiModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    const lite = await getLiteLlmModelDetails(modelId, "xai");

    // Purely metadata-driven modality categorization
    const mode = lite?.mode ?? (modelId.includes("video") ? "video_generation" : modelId.includes("image") ? "image_generation" : "chat");
    const isImage = mode === "image_generation";
    const isVideo = mode === "video_generation";
    const isAudio = mode === "audio_transcription";

    const isVision = Boolean(lite?.supports_vision ?? modelId.includes("vision"));
    const isExplicitlyNonReasoning = modelId.includes("non-reasoning");
    const rawEfforts = raw.capabilities?.reasoning_effort;
    const isReasoning =
      !isExplicitlyNonReasoning &&
      Boolean(
        (rawEfforts && rawEfforts.length > 0) || lite?.supports_reasoning,
      );
    const hasTools = Boolean(
      lite?.supports_function_calling ?? (!isImage && !isVideo),
    );

    // Build inputs and outputs directly from metadata
    const inputs: Modality[] = ["text"];
    const outputs: Modality[] = ["text"];

    if (isVision) inputs.push("image");
    if (lite?.supports_pdf_input) inputs.push("file");

    if (isImage) {
      outputs.length = 0;
      outputs.push("image");
    } else if (isVideo) {
      outputs.length = 0;
      outputs.push("video");
    } else if (isAudio) {
      inputs.length = 0;
      inputs.push("audio");
    }

    // Determine reasoning effort levels strictly when reasoning is supported
    const effortLevels: ReasoningEffortLevel[] | null =
      isReasoning && rawEfforts
        ? rawEfforts.filter((e): e is ReasoningEffortLevel =>
            ["none", "low", "medium", "high", "xhigh"].includes(e),
          )
        : null;

    // Build descriptive tags
    const tags: string[] = [];
    if (isImage) tags.push("image");
    if (isVideo) tags.push("video");
    if (isReasoning) tags.push("reasoning");
    if (isVision) tags.push("vision");
    if (!isImage && !isVideo && !isAudio) tags.push("chat");

    const catalogModel: CatalogModel = {
      provider_id: "xai",
      id: modelId,
      canonical_id: `xai/${modelId}`,
      name: cleanDisplayName(modelId),
      origin_provider: "xai",
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: false,
        codeExecution: false,
        realtime: false,
        videoReasoning: false,
        fileInput: Boolean(lite?.supports_pdf_input),
        supportsStreaming: !isImage,
        supportsSystemPrompt: lite?.supports_system_messages ?? true,
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? "effort" : null,
          effort_levels: effortLevels,
          budget_tokens: null,
          can_toggle_off: true,
          default_state: isReasoning ? "enabled" : "disabled",
        },
      },
      image_options: isImage ? XAI_IMAGE_OPTIONS : null,
      tts_options: null,
      video_options: isVideo ? XAI_VIDEO_OPTIONS : null,
      context_length: raw.context_length ?? lite?.max_input_tokens ?? lite?.max_tokens ?? null,
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
