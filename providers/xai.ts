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
export type XAiRawModel = {
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
};

type XAiModelsResponse = {
  data: XAiRawModel[];
};

// constants ---------------------------------
// Source: https://docs.x.ai/docs/guides/image-generation
export const XAI_IMAGE_OPTIONS: ImageOptions = {
  sizes: ["1024x1024"],
  aspectRatios: ["1:1", "16:9", "9:16"],
  qualities: ["standard"],
  styles: null,
  supportsSeed: true,
  providerParamKey: "xai",
};

// Source: https://docs.x.ai/docs/guides/video-generation
export const XAI_VIDEO_OPTIONS: VideoOptions = {
  durations: [5, 10],
  aspectRatios: ["16:9", "9:16", "1:1"],
  resolutions: ["720p", "1080p"],
  defaultDuration: 5,
  defaultAspectRatio: "16:9",
  defaultResolution: "720p",
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
    const mode =
      lite?.mode ??
      (modelId.includes("video")
        ? "video_generation"
        : modelId.includes("image")
          ? "image_generation"
          : "chat");
    const isImage = mode === "image_generation";
    const isVideo = mode === "video_generation";
    const isAudio = mode === "audio_transcription";

    const isVision = Boolean(
      lite?.supports_vision ?? modelId.includes("vision"),
    );
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
      providerId: "xai",
      id: modelId,
      canonicalId: `xai/${modelId}`,
      name: cleanDisplayName(modelId),
      originProvider: "xai",
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
          effortLevels: effortLevels,
          budgetTokens: null,
          canToggleOff: true,
          defaultState: isReasoning ? "enabled" : "disabled",
        },
      },
      imageOptions: isImage ? XAI_IMAGE_OPTIONS : null,
      ttsOptions: null,
      videoOptions: isVideo ? XAI_VIDEO_OPTIONS : null,
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

    // Validate against our schema
    const validated = CatalogModelSchema.parse(catalogModel);
    catalogModels.push(validated);
  }

  return catalogModels;
}
