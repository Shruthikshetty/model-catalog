import env from "../env";
import { URL } from "../constants";
import {
  type CatalogModel,
  type ImageOptions,
  type Modality,
  type ReasoningEffortLevel,
  type VideoOptions,
} from "../types";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------

/**
 * Shape of a raw model object from NoKeep API.
 * Endpoint: https://nokeep.ai/v1/models
 */
export type NoKeepRawModel = {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  name?: string;
  type?: string;
  endpoint?: string;
  context_length?: number | null;
  max_output_tokens?: number | null;
  input_modalities?: string[];
  output_modalities?: string[];
  reasoning_efforts?: string[];
  aspect_ratios?: string[];
  seconds?: number[];
  max_prompt_characters?: number;
  max_side?: number;
  pricing?: {
    per_image?: Record<string, string>;
    per_second?: Record<string, string>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type NoKeepModelsResponse = {
  object?: string;
  data: NoKeepRawModel[];
};

// functions ---------------------------------

/**
 * Fetches the model catalog from NoKeep API.
 */
export async function fetchNoKeepModels(): Promise<NoKeepRawModel[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (env.NOKEEP_API_KEY) {
    headers.Authorization = `Bearer ${env.NOKEEP_API_KEY}`;
  }

  const response = await fetch(URL.NOKEEP_MODELS, {
    method: "GET",
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from NoKeep API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as NoKeepModelsResponse;
  return json.data || [];
}

/**
 * Main generator that fetches NoKeep models, standardizes multimodal configurations,
 * and returns typed CatalogModel entries.
 */
export async function getNoKeepCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchNoKeepModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;
    const type = raw.type || "chat";

    const inputs: Modality[] = (raw.input_modalities as Modality[]) || ["text"];
    const outputs: Modality[] = (raw.output_modalities as Modality[]) || ["text"];

    const isVision = inputs.includes("image");
    const isReasoning = Boolean(raw.reasoning_efforts && raw.reasoning_efforts.length > 0);
    const hasTools = type === "chat" || (!raw.type && !raw.endpoint?.includes("image") && !raw.endpoint?.includes("video"));

    const tags: string[] = [];
    if (outputs.includes("text")) tags.push("chat");
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools && outputs.includes("text")) tags.push("tools");
    if (outputs.includes("image")) tags.push("image-generation");
    if (outputs.includes("video")) tags.push("video-generation");
    if (tags.length === 0) tags.push("chat");

    let imageOptions: ImageOptions | null = null;
    if (outputs.includes("image")) {
      imageOptions = {
        sizes: [],
        aspect_ratios: raw.aspect_ratios || ["1:1"],
        qualities: raw.pricing?.per_image ? Object.keys(raw.pricing.per_image) : ["standard"],
        styles: null,
        supports_seed: true,
        provider_param_key: "nokeep",
      };
    }

    let videoOptions: VideoOptions | null = null;
    if (outputs.includes("video")) {
      const durations = raw.seconds || [5];
      const aspectRatios = raw.aspect_ratios || ["16:9"];
      const resolutions = raw.pricing?.per_second ? Object.keys(raw.pricing.per_second) : ["720p"];

      videoOptions = {
        durations,
        aspect_ratios: aspectRatios,
        resolutions,
        default_duration: durations[0] ?? 5,
        default_aspect_ratio: aspectRatios[0] ?? "16:9",
        default_resolution: resolutions[0] ?? "720p",
      };
    }

    const effortLevels: ReasoningEffortLevel[] = [];
    if (raw.reasoning_efforts) {
      for (const eff of raw.reasoning_efforts) {
        if (eff === "none") effortLevels.push("none");
        else if (eff === "low") effortLevels.push("low");
        else if (eff === "medium") effortLevels.push("medium");
        else if (eff === "high") effortLevels.push("high");
        else if (eff === "max") effortLevels.push("max");
      }
    }

    const catalogModel: CatalogModel = {
      provider_id: "nokeep",
      id: modelId,
      canonical_id: `nokeep/${modelId}`,
      name: raw.name || cleanDisplayName(modelId),
      origin_provider: raw.owned_by?.toLowerCase().trim() || "nokeep",
      inputs,
      outputs,
      capabilities: {
        vision: isVision,
        functionCalling: hasTools,
        webSearch: false,
        codeExecution: false,
        realtime: false,
        videoReasoning: false,
        fileInput: false,
        supportsStreaming: true,
        supportsSystemPrompt: true,
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? "effort" : null,
          effort_levels: effortLevels.length > 0 ? effortLevels : null,
          budget_tokens: null,
          can_toggle_off: true,
          default_state: isReasoning ? "enabled" : "disabled",
        },
      },
      image_options: imageOptions,
      tts_options: null,
      video_options: videoOptions,
      context_length: raw.context_length ?? null,
      max_output_tokens: raw.max_output_tokens ?? null,
      description: null,
      tags,
      is_deprecated: false,
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
