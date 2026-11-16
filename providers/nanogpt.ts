import { URL } from "../constants";
import {
  type CatalogModel,
  type Modality,
  type ReasoningEffortLevel,
} from "../types";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------

/**
 * Shape of a raw model object from NanoGPT API.
 * Endpoint: https://nano-gpt.com/api/v1/models?detailed=true
 */
export type NanoGptRawModel = {
  id: string;
  name?: string;
  object?: string;
  created?: number;
  owned_by?: string;
  description?: string;
  context_length?: number | null;
  max_output_tokens?: number | null;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  capabilities?: {
    vision?: boolean;
    video_input?: boolean;
    audio_input?: boolean;
    reasoning?: boolean;
    tool_calling?: boolean;
    parallel_tool_calls?: boolean;
    structured_output?: boolean;
    pdf_upload?: boolean;
    batch_api?: boolean;
    [key: string]: unknown;
  };
  reasoning_efforts?: string[];
  open_weights?: boolean;
  pricing?: {
    prompt?: number;
    completion?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type NanoGptModelsResponse = {
  object?: string;
  data: NanoGptRawModel[];
};

// utils -------------------------------------

/**
 * Extracts origin provider family slug from model ID or owned_by.
 */
function extractOriginProvider(id: string, ownedBy?: string): string {
  if (id.includes("/")) {
    return id.split("/")[0]?.toLowerCase().trim() || "nanogpt";
  }
  if (ownedBy && ownedBy !== "other" && ownedBy !== "nanogpt") {
    return ownedBy.toLowerCase().trim();
  }
  return "nanogpt";
}

// functions ---------------------------------

/**
 * Fetches the public model catalog from NanoGPT API.
 */
export async function fetchNanoGptModels(): Promise<NanoGptRawModel[]> {
  const response = await fetch(URL.NANOGPT_MODELS, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from NanoGPT API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as NanoGptModelsResponse;
  return json.data || [];
}

/**
 * Main generator that fetches NanoGPT models, standardizes capabilities and limits,
 * and returns typed CatalogModel entries.
 */
export async function getNanoGptCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchNanoGptModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;

    const rawInputs = raw.architecture?.input_modalities || ["text"];
    const rawOutputs = raw.architecture?.output_modalities || ["text"];

    const inputs: Modality[] = [];
    for (const inp of rawInputs) {
      if (inp === "text" && !inputs.includes("text")) inputs.push("text");
      else if (inp === "image" && !inputs.includes("image")) inputs.push("image");
      else if (inp === "audio" && !inputs.includes("audio")) inputs.push("audio");
      else if (inp === "video" && !inputs.includes("video")) inputs.push("video");
      else if (inp === "file" && !inputs.includes("file")) inputs.push("file");
    }
    if (raw.capabilities?.pdf_upload && !inputs.includes("file")) inputs.push("file");
    if (raw.capabilities?.vision && !inputs.includes("image")) inputs.push("image");
    if (raw.capabilities?.video_input && !inputs.includes("video")) inputs.push("video");
    if (raw.capabilities?.audio_input && !inputs.includes("audio")) inputs.push("audio");
    if (inputs.length === 0) inputs.push("text");

    const outputs: Modality[] = [];
    for (const out of rawOutputs) {
      if (out === "text" && !outputs.includes("text")) outputs.push("text");
      else if (out === "image" && !outputs.includes("image")) outputs.push("image");
      else if (out === "audio" && !outputs.includes("audio")) outputs.push("audio");
      else if (out === "video" && !outputs.includes("video")) outputs.push("video");
      else if (out === "embedding" && !outputs.includes("embedding")) outputs.push("embedding");
    }
    if (outputs.length === 0) outputs.push("text");

    const isVision = inputs.includes("image") || Boolean(raw.capabilities?.vision);
    const hasTools = Boolean(raw.capabilities?.tool_calling);
    const isReasoning = Boolean(raw.capabilities?.reasoning);
    const hasEfforts = Boolean(raw.reasoning_efforts && raw.reasoning_efforts.length > 0);

    const tags: string[] = [];
    if (outputs.includes("text")) tags.push("chat");
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools && outputs.includes("text")) tags.push("tools");
    if (outputs.includes("image")) tags.push("image-generation");
    if (outputs.includes("video")) tags.push("video-generation");
    if (outputs.includes("audio")) tags.push("tts");
    if (outputs.includes("embedding")) tags.push("embedding");
    if (tags.length === 0) tags.push("chat");

    const effortLevels: ReasoningEffortLevel[] = [];
    if (raw.reasoning_efforts) {
      for (const eff of raw.reasoning_efforts) {
        if (eff === "none") effortLevels.push("none");
        else if (eff === "minimal") effortLevels.push("minimal");
        else if (eff === "low") effortLevels.push("low");
        else if (eff === "medium") effortLevels.push("medium");
        else if (eff === "high") effortLevels.push("high");
        else if (eff === "xhigh") effortLevels.push("xhigh");
        else if (eff === "max") effortLevels.push("max");
      }
    }

    const catalogModel: CatalogModel = {
      provider_id: "nanogpt",
      id: modelId,
      canonical_id: `nanogpt/${modelId}`,
      name: raw.name || cleanDisplayName(modelId),
      origin_provider: extractOriginProvider(modelId, raw.owned_by),
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: false,
        codeExecution: false,
        realtime: false,
        videoReasoning: isVision && inputs.includes("video"),
        fileInput: inputs.includes("file"),
        supportsStreaming: true,
        supportsSystemPrompt: true,
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? (hasEfforts ? "effort" : "toggle") : null,
          effort_levels: effortLevels.length > 0 ? effortLevels : null,
          budget_tokens: null,
          can_toggle_off: true,
          default_state: isReasoning ? "enabled" : "disabled",
        },
      },
      image_options: null,
      tts_options: null,
      video_options: null,
      context_length: raw.context_length ?? null,
      max_output_tokens: raw.max_output_tokens ?? null,
      description: raw.description || null,
      tags,
      is_deprecated: false,
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
