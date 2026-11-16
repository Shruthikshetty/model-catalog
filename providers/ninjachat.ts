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
 * Shape of a raw model object from NinjaChat API.
 * Endpoint: https://www.ninjachat.ai/api/v1/models
 */
export type NinjaChatRawModel = {
  id: string;
  name?: string;
  object?: string;
  created?: number;
  owned_by?: string;
  modality?: string;
  status?: string;
  servable?: boolean;
  description?: string;
  capabilities?: string[];
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  supportedParameters?: string[];
  brand?: string;
  [key: string]: unknown;
};

type NinjaChatModelsResponse = {
  object?: string;
  data: NinjaChatRawModel[];
};

// functions ---------------------------------

/**
 * Fetches the list of models from NinjaChat API.
 */
export async function fetchNinjaChatModels(): Promise<NinjaChatRawModel[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.NINJA_CHAT_API_KEY) {
    headers.Authorization = `Bearer ${env.NINJA_CHAT_API_KEY}`;
  }

  const response = await fetch(URL.NINJACHAT_MODELS, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from NinjaChat API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as NinjaChatModelsResponse;
  return json.data || [];
}

/**
 * Main generator that fetches NinjaChat models, maps native modalities and capabilities,
 * enriches missing token limits via LiteLLM, and returns typed CatalogModel entries.
 */
export async function getNinjaChatCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchNinjaChatModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    const lite = await getLiteLlmModelDetails(modelId, raw.owned_by?.toLowerCase().trim());

    const caps = raw.capabilities || [];
    const modality = raw.modality || "text";
    const supportedParams = raw.supportedParameters || [];

    const isVision = caps.includes("vision") || Boolean(lite?.supports_vision);
    const hasTools = caps.includes("tools") || Boolean(lite?.supports_function_calling);
    const isReasoning = caps.includes("reasoning") || Boolean(lite?.supports_reasoning);
    const hasStreaming = caps.includes("streaming") || supportedParams.includes("stream");
    const hasReasoningEffort = supportedParams.includes("reasoning_effort");

    const inputs: Modality[] = ["text"];
    const outputs: Modality[] = [];

    if (modality === "image") {
      outputs.push("image");
    } else if (modality === "image_edit") {
      inputs.push("image");
      outputs.push("image");
    } else if (modality === "video") {
      if (caps.includes("image_reference") || caps.includes("end_frame")) {
        inputs.push("image");
      }
      outputs.push("video");
    } else if (modality === "audio") {
      outputs.push("audio");
    } else if (modality === "rerank") {
      outputs.push("embedding");
    } else {
      if (isVision && !inputs.includes("image")) {
        inputs.push("image");
      }
      outputs.push("text");
      if (caps.includes("audio_output")) {
        outputs.push("audio");
      }
    }

    if (outputs.length === 0) {
      outputs.push("text");
    }

    const tags: string[] = [];
    if (outputs.includes("text") && !outputs.includes("embedding")) tags.push("chat");
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");
    if (outputs.includes("image")) tags.push("image-generation");
    if (outputs.includes("video")) tags.push("video-generation");
    if (outputs.includes("audio")) tags.push("tts");
    if (inputs.includes("audio") && outputs.includes("text")) tags.push("stt");
    if (outputs.includes("embedding")) tags.push("embedding");
    if (tags.length === 0) tags.push("chat");

    const contextLength =
      raw.contextWindow ??
      lite?.max_input_tokens ??
      lite?.max_tokens ??
      null;

    const maxOutputTokens =
      raw.maxOutputTokens ??
      lite?.max_output_tokens ??
      null;

    const catalogModel: CatalogModel = {
      providerId: "ninjachat",
      id: modelId,
      canonicalId: `ninjachat/${modelId}`,
      name: raw.name || cleanDisplayName(modelId),
      originProvider: raw.owned_by?.toLowerCase().trim() || "ninjachat",
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: false,
        codeExecution: false,
        realtime: false,
        videoReasoning: isVision && inputs.includes("video"),
        fileInput: false,
        supportsStreaming: hasStreaming,
        supportsSystemPrompt: lite?.supports_system_messages ?? true,
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? (hasReasoningEffort ? "effort" : "toggle") : null,
          effortLevels: isReasoning && hasReasoningEffort ? ["low", "medium", "high"] : null,
          budgetTokens: null,
          canToggleOff: true,
          defaultState: isReasoning ? "enabled" : "disabled",
        },
      },
      imageOptions: null,
      ttsOptions: null,
      videoOptions: null,
      contextLength: contextLength,
      maxOutputTokens: maxOutputTokens,
      description: raw.description || null,
      tags,
      isDeprecated: raw.status === "deprecated",
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
