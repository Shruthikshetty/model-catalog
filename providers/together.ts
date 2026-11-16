import env from "../env";
import { URL } from "../constants";
import {
  type CatalogModel,
  type ImageOptions,
  type Modality,
  type VideoOptions,
} from "../types";
import { getLiteLlmModelDetails } from "../utils/litellm";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------

/**
 * Shape of a raw model object returned by Together AI's `/v1/models` endpoint.
 * Documentation: https://docs.together.ai/docs/serverless/models
 */
export type TogetherModelType =
  | "chat"
  | "language"
  | "code"
  | "image"
  | "video"
  | "audio"
  | "transcribe"
  | "embedding"
  | "rerank";

export type TogetherPricing = {
  hourly?: number;
  input?: number;
  output?: number;
  base?: number;
  finetune?: number;
  cached_input?: number;
  image_pixel?: number | { price_per_megapixel?: number; min_steps?: number };
  transcribe?: number | { price_per_minute?: number };
  image?: number;
  video?: number | { example_price?: number; example_description?: string };
};

export type TogetherRawModel = {
  id: string;
  object: "model";
  created: number;
  type: TogetherModelType;
  running?: boolean;
  display_name?: string;
  organization?: string;
  link?: string;
  license?: string;
  context_length?: number;
  pricing?: TogetherPricing;
};

// constants ---------------------------------

// Source: https://docs.together.ai/docs/inference/images/parameters
export const TOGETHER_IMAGE_OPTIONS: ImageOptions = {
  sizes: ["1024x1024", "1024x768", "768x1024", "1280x720", "720x1280"],
  aspectRatios: ["1:1", "4:3", "3:4", "16:9", "9:16"],
  qualities: ["standard"],
  styles: null,
  supportsSeed: true,
  providerParamKey: "together",
};

// Source: https://docs.together.ai/docs/inference/videos/parameters
export const TOGETHER_VIDEO_OPTIONS: VideoOptions = {
  durations: [5, 10],
  aspectRatios: ["16:9", "9:16"],
  resolutions: ["720p", "1080p"],
  defaultDuration: 5,
  defaultAspectRatio: "16:9",
  defaultResolution: "720p",
};

// functions ---------------------------------

/**
 * Function to fetch the raw models list from Together AI
 */
export async function fetchTogetherModels(): Promise<TogetherRawModel[]> {
  const apiKey = env.TOGETHER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TOGETHER_API_KEY is not defined in your .env file. Please add TOGETHER_API_KEY=your_key to .env",
    );
  }

  const response = await fetch(URL.TOGETHER_MODELS, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from Together AI (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as TogetherRawModel[];
  return Array.isArray(json) ? json : [];
}

/**
 * Main generator that fetches Together AI models, extracts native attributes,
 * and hydrates capabilities and token limits using LiteLLM.
 */
export async function getTogetherCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchTogetherModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    const lite = await getLiteLlmModelDetails(modelId, "together_ai");

    const mode = lite?.mode ?? raw.type;
    const isImage = raw.type === "image" || mode === "image_generation";
    const isVideo = raw.type === "video" || mode === "video_generation";
    const isTranscription =
      raw.type === "transcribe" || mode === "audio_transcription";
    const isAudioOutput = raw.type === "audio" || mode === "audio_speech";
    const isEmbedding =
      raw.type === "embedding" || raw.type === "rerank" || mode === "embedding";

    const isVision = Boolean(
      lite?.supports_vision ??
      (modelId.toLowerCase().includes("vision") ||
        modelId.toLowerCase().includes("-vl")),
    );

    const isReasoning = Boolean(
      lite?.supports_reasoning ??
      (modelId.toLowerCase().includes("reasoning") ||
        modelId.toLowerCase().includes("-r1")),
    );

    const hasTools = Boolean(
      lite?.supports_function_calling ??
      (raw.type === "chat" && !isImage && !isVideo && !isEmbedding),
    );

    const hasFileInput = Boolean(lite?.supports_pdf_input);

    // Inputs and Outputs determination
    const inputs: Modality[] = ["text"];
    const outputs: Modality[] = ["text"];

    if (isTranscription) {
      inputs.length = 0;
      inputs.push("audio");
    } else if (isVision) {
      inputs.push("image");
    }

    if (hasFileInput) {
      inputs.push("file");
    }

    if (isImage) {
      outputs.length = 0;
      outputs.push("image");
    } else if (isVideo) {
      outputs.length = 0;
      outputs.push("video");
    } else if (isAudioOutput) {
      outputs.length = 0;
      outputs.push("audio");
    } else if (isEmbedding) {
      outputs.length = 0;
      outputs.push("embedding");
    }

    // Descriptive tags
    const tags: string[] = [];
    if (isImage) tags.push("image");
    if (isVideo) tags.push("video");
    if (isTranscription) tags.push("audio", "stt");
    if (isAudioOutput) tags.push("audio", "tts");
    if (isEmbedding) tags.push("embedding");
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");
    if (raw.type === "code") tags.push("code");
    if (
      !isImage &&
      !isVideo &&
      !isEmbedding &&
      !isTranscription &&
      !isAudioOutput
    ) {
      tags.push("chat");
    }

    const catalogModel: CatalogModel = {
      providerId: "together",
      id: modelId,
      canonicalId: `together/${modelId}`,
      name: raw.display_name || cleanDisplayName(modelId),
      originProvider:
        raw.organization?.toLowerCase() ||
        lite?.litellm_provider ||
        modelId.split("/")[0]?.toLowerCase() ||
        "together",
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: false,
        codeExecution: false,
        realtime: false,
        videoReasoning: false,
        fileInput: hasFileInput,
        supportsStreaming: !isImage && !isVideo && !isEmbedding,
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
      imageOptions: isImage ? TOGETHER_IMAGE_OPTIONS : null,
      ttsOptions: null,
      videoOptions: isVideo ? TOGETHER_VIDEO_OPTIONS : null,
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
