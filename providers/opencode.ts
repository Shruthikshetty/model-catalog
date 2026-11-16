import { URL } from "../constants";
import {
  type CatalogModel,
  type Modality,
} from "../types";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------

/**
 * Shape of a raw model object from OpenCode Zen API.
 * Endpoint: https://opencode.ai/zen/v1/models
 */
export type OpenCodeRawModel = {
  id: string;
  name?: string;
  object?: string;
  created?: number;
  owned_by?: string;
  canonical_id?: string;
  type?: string;
  description?: string;
  family?: string;
  open_weights?: boolean;
  modalities?: {
    input?: string[];
    output?: string[];
  };
  capabilities?: {
    tools?: {
      supported?: boolean;
    };
    reasoning?: {
      supported?: boolean;
    };
    structured_output?: boolean;
    temperature?: boolean;
    system_updates?: boolean;
    effort_updates?: boolean;
    [key: string]: unknown;
  };
  limit?: {
    context?: number | null;
    input?: number | null;
    output?: number | null;
  };
  [key: string]: unknown;
};

type OpenCodeModelsResponse = {
  object?: string;
  data: OpenCodeRawModel[];
};

// utils -------------------------------------

/**
 * Maps standard MIME types and format strings to catalog Modality.
 */
function parseMimeToModality(mime: string): Modality | null {
  if (mime === "text") return "text";
  const [type] = mime.split("/");
  if (type === "image" || type === "audio" || type === "video") {
    return type;
  }
  if (type === "application") {
    return "file";
  }
  return null;
}

// functions ---------------------------------

/**
 * Fetches the public model catalog from OpenCode Zen API.
 */
export async function fetchOpenCodeModels(): Promise<OpenCodeRawModel[]> {
  const response = await fetch(URL.OPENCODE_MODELS, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from OpenCode API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as OpenCodeModelsResponse;
  return json.data || [];
}

/**
 * Main generator that fetches OpenCode models, extracts native capabilities and limits,
 * and returns typed CatalogModel entries.
 */
export async function getOpenCodeCatalog(): Promise<CatalogModel[]> {
  const rawModels = await fetchOpenCodeModels();
  const catalogModels: CatalogModel[] = [];

  for (const raw of rawModels) {
    const modelId = raw.id;

    const inputSet = new Set<Modality>(["text"]);
    for (const mime of raw.modalities?.input || []) {
      const mod = parseMimeToModality(mime);
      if (mod) inputSet.add(mod);
    }
    const inputs: Modality[] = Array.from(inputSet);

    const outputs: Modality[] = ["text"];

    const isVision = inputs.includes("image");
    const hasTools = Boolean(raw.capabilities?.tools?.supported);
    const isReasoning = Boolean(raw.capabilities?.reasoning?.supported);
    const hasEffortUpdates = Boolean(raw.capabilities?.effort_updates);

    const tags: string[] = ["chat"];
    if (isVision) tags.push("vision");
    if (isReasoning) tags.push("reasoning");
    if (hasTools) tags.push("tools");

    const originProvider = raw.canonical_id
      ? raw.canonical_id.split("/")[0]?.toLowerCase().trim() || "opencode"
      : raw.owned_by?.toLowerCase().trim() || "opencode";

    const contextLength = raw.limit?.context ?? null;
    const maxOutputTokens = raw.limit?.output ?? null;

    const catalogModel: CatalogModel = {
      providerId: "opencode",
      id: modelId,
      canonicalId: `opencode/${modelId}`,
      name: raw.name || cleanDisplayName(modelId),
      originProvider: originProvider,
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
        supportsSystemPrompt: Boolean(raw.capabilities?.system_updates ?? true),
        reasoning: {
          supported: isReasoning,
          type: isReasoning ? (hasEffortUpdates ? "effort" : "toggle") : null,
          effortLevels: isReasoning && hasEffortUpdates ? ["low", "medium", "high"] : null,
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
      isDeprecated: false,
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
