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
 * Shape of a raw model object from Alibaba DashScope Model Management API.
 * Endpoint: https://dashscope-intl.aliyuncs.com/api/v1/models
 */
export type AlibabaRawModel = {
  model: string;
  name?: string;
  description?: string;
  features?: string[];
  provider?: string;
  capabilities?: string[];
  published_time?: string;
  inference_metadata?: {
    request_modality?: string[];
    response_modality?: string[];
  };
  model_info?: {
    context_window?: number | null;
    max_input_tokens?: number | null;
    max_output_tokens?: number | null;
    max_reasoning_tokens?: number | null;
    reasoning_max_input_tokens?: number | null;
    reasoning_max_output_tokens?: number | null;
  };
  inference_offline_info?: {
    offline_time?: string;
  } | null;
  [key: string]: unknown;
};

type AlibabaModelsResponse = {
  code?: string | null;
  message?: string | null;
  success?: boolean;
  output?: {
    total: number;
    page_no: number;
    page_size: number;
    models: AlibabaRawModel[];
  };
};

// functions ---------------------------------

/**
 * Fetches all available models from Alibaba DashScope API with pagination handling.
 */
export async function fetchAlibabaModels(): Promise<AlibabaRawModel[]> {
  const allModels: AlibabaRawModel[] = [];
  let page = 1;
  const pageSize = 200;

  while (true) {
    const url = new globalThis.URL(URL.ALIBABA_MODELS);
    url.searchParams.set("page_no", String(page));
    url.searchParams.set("page_size", String(pageSize));

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.ALIBABA_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to fetch models from Alibaba DashScope API (${response.status}): ${errorText}`,
      );
    }

    const json = (await response.json()) as AlibabaModelsResponse;
    const models = json.output?.models;

    if (!models || models.length === 0) {
      break;
    }

    allModels.push(...models);

    const total = json.output?.total ?? 0;
    if (allModels.length >= total) {
      break;
    }

    page++;
  }

  return allModels;
}

/**
 * Main generator that fetches Alibaba DashScope models, normalizes native capabilities,
 * enriches missing token limits via LiteLLM, and returns typed CatalogModel entries.
 */
export async function getAlibabaCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchAlibabaModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.model;
    const lite = await getLiteLlmModelDetails(modelId, "dashscope");

    const rawCaps = raw.capabilities || [];
    const rawFeatures = raw.features || [];

    const isVision = rawCaps.includes("VU") || Boolean(lite?.supports_vision);
    const hasTools =
      rawFeatures.includes("function-calling") ||
      Boolean(lite?.supports_function_calling);
    const hasWebSearch =
      rawFeatures.includes("web-search") ||
      Boolean(lite?.supports_web_search);
    const isReasoning =
      rawCaps.includes("Reasoning") ||
      Boolean(lite?.supports_reasoning);

    const inputs: Modality[] = [];
    for (const req of raw.inference_metadata?.request_modality || []) {
      const lower = req.toLowerCase();
      if (lower === "text" && !inputs.includes("text")) inputs.push("text");
      else if (lower === "image" && !inputs.includes("image")) inputs.push("image");
      else if (lower === "audio" && !inputs.includes("audio")) inputs.push("audio");
      else if (lower === "video" && !inputs.includes("video")) inputs.push("video");
    }
    if (inputs.length === 0) inputs.push("text");

    const outputs: Modality[] = [];
    for (const resp of raw.inference_metadata?.response_modality || []) {
      const lower = resp.toLowerCase();
      if (lower === "text" && !outputs.includes("text")) outputs.push("text");
      else if (lower === "image" && !outputs.includes("image")) outputs.push("image");
      else if (lower === "audio" && !outputs.includes("audio")) outputs.push("audio");
      else if (lower === "video" && !outputs.includes("video")) outputs.push("video");
    }
    if (rawCaps.includes("ME") || (rawCaps.includes("TR") && outputs.length === 0)) {
      if (!outputs.includes("embedding")) outputs.push("embedding");
    }
    if (outputs.length === 0) outputs.push("text");

    const isRealtime = rawCaps.some((c) => c.startsWith("Realtime-"));

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
      raw.model_info?.context_window ??
      lite?.max_input_tokens ??
      lite?.max_tokens ??
      null;

    const maxOutputTokens =
      raw.model_info?.max_output_tokens ??
      lite?.max_output_tokens ??
      null;

    const catalogModel: CatalogModel = {
      provider_id: "alibaba",
      id: modelId,
      canonical_id: `alibaba/${modelId}`,
      name: raw.name || cleanDisplayName(modelId),
      origin_provider: raw.provider?.toLowerCase().trim() || "alibaba",
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: hasWebSearch,
        codeExecution: false,
        realtime: isRealtime,
        videoReasoning: rawCaps.includes("VU") && inputs.includes("video"),
        fileInput: false,
        supportsStreaming: true,
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
      context_length: contextLength,
      max_output_tokens: maxOutputTokens,
      description: raw.description || null,
      tags,
      is_deprecated: Boolean(raw.inference_offline_info),
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
