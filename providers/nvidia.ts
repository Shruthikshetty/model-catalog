import { URL } from "../constants";
import {
  type CatalogModel,
  type Modality,
} from "../types";
import { getLiteLlmModelDetails } from "../utils/litellm";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------

/**
 * Shape of a raw model object returned by NVIDIA NIM's `/v1/models` endpoint.
 * Documentation: https://build.nvidia.com/
 * API Reference: https://integrate.api.nvidia.com/v1/models
 */
export type NvidiaRawModel = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  [key: string]: unknown;
};

type NvidiaModelsResponse = {
  object?: string;
  data: NvidiaRawModel[];
};

// utils -------------------------------------

function extractOrigin(ownedBy?: string, modelId?: string): string {
  const prefix = modelId?.split("/")[0]?.toLowerCase() ?? "";
  const owner = (ownedBy || prefix || "nvidia").toLowerCase().trim();

  if (owner.includes("deepseek")) return "deepseek";
  if (owner.includes("mistral")) return "mistral";
  if (owner.includes("meta")) return "meta";
  if (owner.includes("google")) return "google";
  if (owner.includes("microsoft")) return "microsoft";
  if (owner.includes("openai")) return "openai";
  if (owner.includes("ibm")) return "ibm";
  if (owner.includes("nvidia")) return "nvidia";
  if (owner.includes("01-ai")) return "01-ai";
  if (owner.includes("moonshot") || owner.includes("kimi")) return "moonshot";
  return owner;
}

// functions ---------------------------------

/**
 * Fetches the raw models list from NVIDIA NIM API
 */
export async function fetchNvidiaModels(): Promise<NvidiaRawModel[]> {
  const response = await fetch(URL.NVIDIA_MODELS, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from NVIDIA NIM API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as NvidiaModelsResponse;
  return json.data || [];
}

/**
 * Main generator that fetches NVIDIA NIM models, extracts native attributes,
 * and hydrates capabilities and token limits using LiteLLM.
 */
export async function getNvidiaCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchNvidiaModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    const lowerId = modelId.toLowerCase();
    const lite = await getLiteLlmModelDetails(modelId, "nvidia_nim");

    const isEmbedding =
      lite?.mode === "embedding" ||
      lowerId.includes("embed");

    const isVision = Boolean(
      lite?.supports_vision ??
      (lowerId.includes("vision") || lowerId.includes("-vl")),
    );

    const isReasoning = Boolean(
      lite?.supports_reasoning ??
      (lowerId.includes("reasoning") || lowerId.includes("-r1")),
    );

    const hasTools = Boolean(
      lite?.supports_function_calling ??
      (!isEmbedding && lowerId.includes("instruct")),
    );

    // Inputs determination
    const inputs: Modality[] = ["text"];
    if (isVision) inputs.push("image");

    // Outputs determination
    const outputs: Modality[] = isEmbedding ? ["embedding"] : ["text"];

    // Descriptive tags
    const tags: string[] = [];
    if (isEmbedding) tags.push("embedding");
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");
    if (!isEmbedding) tags.push("chat");

    const catalogModel: CatalogModel = {
      provider_id: "nvidia",
      id: modelId,
      canonical_id: `nvidia/${modelId}`,
      name: cleanDisplayName(modelId),
      origin_provider: extractOrigin(raw.owned_by, modelId),
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
        supportsStreaming: !isEmbedding,
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
        lite?.max_input_tokens ??
        lite?.max_tokens ??
        null,
      max_output_tokens: lite?.max_output_tokens ?? null,
      description: null,
      tags,
      is_deprecated: false,
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
