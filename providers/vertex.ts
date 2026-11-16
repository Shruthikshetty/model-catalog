import {
  type CatalogModel,
  type ImageOptions,
  type Modality,
  type TtsOptions,
} from "../types";
import { getLiteLlmModelDetails } from "../utils/litellm";

// types -------------------------------------

export type VertexStaticModel = {
  id: string;
  name: string;
  provider: "google-vertex";
  inputs: readonly Modality[];
  outputs: readonly Modality[];
  capabilities: {
    vision: boolean;
    videoReasoning: boolean;
    realtime: boolean;
  };
};

// constants ---------------------------------

/**
 * Verified Google Vertex AI Foundation models list for Express Mode.
 * Reference: https://cloud.google.com/vertex-ai/generative-ai/docs/model-garden/explore-models
 */
export const VERTEX_EXPRESS_MODELS: readonly VertexStaticModel[] = [
  // Gemini 4 Element Series (Agent Platform / Express)
  {
    id: "gemini-4-argon",
    name: "Gemini 4 Argon",
    provider: "google-vertex",
    inputs: ["text", "image", "video", "audio", "file"],
    outputs: ["text"],
    capabilities: {
      vision: true,
      videoReasoning: true,
      realtime: false,
    },
  },
  {
    id: "gemini-4-hydrogen",
    name: "Gemini 4 Hydrogen",
    provider: "google-vertex",
    inputs: ["text", "image", "video", "audio", "file"],
    outputs: ["text"],
    capabilities: {
      vision: true,
      videoReasoning: true,
      realtime: false,
    },
  },
  {
    id: "gemini-4-carbon",
    name: "Gemini 4 Carbon (Billing Required)",
    provider: "google-vertex",
    inputs: ["text", "image", "video", "audio", "file"],
    outputs: ["text"],
    capabilities: {
      vision: true,
      videoReasoning: true,
      realtime: false,
    },
  },

  // Gemini 3 Series
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    provider: "google-vertex",
    inputs: ["text", "image", "video", "audio", "file"],
    outputs: ["text"],
    capabilities: {
      vision: true,
      videoReasoning: true,
      realtime: false,
    },
  },
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "google-vertex",
    inputs: ["text", "image", "video", "audio", "file"],
    outputs: ["text"],
    capabilities: {
      vision: true,
      videoReasoning: true,
      realtime: false,
    },
  },
  {
    id: "gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    provider: "google-vertex",
    inputs: ["text", "image", "video", "audio", "file"],
    outputs: ["text"],
    capabilities: {
      vision: true,
      videoReasoning: true,
      realtime: false,
    },
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    provider: "google-vertex",
    inputs: ["text", "image", "video", "audio", "file"],
    outputs: ["text"],
    capabilities: {
      vision: true,
      videoReasoning: true,
      realtime: false,
    },
  },

  // Image Generation
  {
    id: "gemini-nano-banana-2.1",
    name: "Gemini Nano Banana 2.1",
    provider: "google-vertex",
    inputs: ["text"],
    outputs: ["image"],
    capabilities: {
      vision: false,
      videoReasoning: false,
      realtime: false,
    },
  },

  // TTS (Text-to-Speech)
  {
    id: "gemini-3.8-flash-tts",
    name: "Gemini 3.8 Flash TTS",
    provider: "google-vertex",
    inputs: ["text"],
    outputs: ["audio"],
    capabilities: {
      vision: false,
      videoReasoning: false,
      realtime: false,
    },
  },
] as const;

// functions ---------------------------------

/**
 * Main generator that builds Google Vertex AI Express models, hydrates token limits
 * and capabilities from LiteLLM, and returns typed CatalogModel entries.
 */
export async function getVertexCatalog(): Promise<CatalogModel[]> {
  const catalogModels: CatalogModel[] = [];

  for (const raw of VERTEX_EXPRESS_MODELS) {
    const lite = await getLiteLlmModelDetails(raw.id, "vertex_ai");

    const inputs: Modality[] = [...raw.inputs];
    const outputs: Modality[] = [...raw.outputs];

    const isVision = outputs.includes("text") && (raw.capabilities.vision || Boolean(lite?.supports_vision));
    const hasTools = outputs.includes("text") && (lite?.supports_function_calling ?? true);
    const isReasoning = outputs.includes("text") && Boolean(lite?.supports_reasoning);

    const tags: string[] = [];
    if (outputs.includes("text")) tags.push("chat");
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");
    if (outputs.includes("image")) tags.push("image-generation");
    if (outputs.includes("audio")) tags.push("tts");

    let imageOptions: ImageOptions | null = null;
    if (outputs.includes("image")) {
      imageOptions = {
        sizes: ["1024x1024"],
        aspectRatios: ["1:1", "3:4", "4:3", "9:16", "16:9"],
        qualities: ["standard"],
        styles: null,
        supportsSeed: true,
        providerParamKey: "google",
      };
    }

    let ttsOptions: TtsOptions | null = null;
    if (outputs.includes("audio")) {
      ttsOptions = {
        voices: [],
        formats: ["mp3", "wav", "pcm"],
        speeds: {
          min: 0.25,
          max: 4.0,
        },
      };
    }

    const catalogModel: CatalogModel = {
      providerId: "google-vertex",
      id: raw.id,
      canonicalId: `google-vertex/${raw.id}`,
      name: raw.name,
      originProvider: "google",
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: outputs.includes("text"),
        codeExecution: outputs.includes("text"),
        realtime: raw.capabilities.realtime,
        videoReasoning: raw.capabilities.videoReasoning,
        fileInput: inputs.includes("file"),
        supportsStreaming: true,
        supportsSystemPrompt: lite?.supports_system_messages ?? true,
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? "budget" : null,
          effortLevels: null,
          budgetTokens: null,
          canToggleOff: true,
          defaultState: isReasoning ? "enabled" : "disabled",
        },
      },
      imageOptions: imageOptions,
      ttsOptions: ttsOptions,
      videoOptions: null,
      contextLength: lite?.max_input_tokens ?? lite?.max_tokens ?? 1048576,
      maxOutputTokens: lite?.max_output_tokens ?? 65536,
      description: null,
      tags,
      isDeprecated: false,
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
