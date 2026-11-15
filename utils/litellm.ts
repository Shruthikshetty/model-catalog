import { URL } from "../constants";

// types -------------------------------------
export interface LiteLlmModelEntry {
  max_input_tokens?: number;
  max_output_tokens?: number;
  max_tokens?: number;
  mode?: string;
  supports_vision?: boolean;
  supports_function_calling?: boolean;
  supports_parallel_function_calling?: boolean;
  supports_reasoning?: boolean;
  supports_pdf_input?: boolean;
  supports_system_messages?: boolean;
  supports_response_schema?: boolean;
  supports_web_search?: boolean;
  supported_modalities?: string[];
  supported_output_modalities?: string[];
  litellm_provider?: string;
  deprecation_date?: string;
  [key: string]: unknown;
}

export type LiteLlmCatalog = Record<string, LiteLlmModelEntry>;

// state -------------------------------------
// In-memory cache so we only download the LiteLLM catalog once
let catalogPromise: Promise<LiteLlmCatalog> | null = null;

// utils -------------------------------------
/**
 * Loads the raw LiteLLM catalog once and caches it in memory.
 */
async function loadCatalog(): Promise<LiteLlmCatalog> {
  // in case already fetching or in memory then return it
  if (catalogPromise) {
    return catalogPromise;
  }

  // fetch and cache the catalog
  catalogPromise = (async () => {
    // fetch the catalog
    const response = await fetch(URL.LITELLM_MODELS, {
      method: "GET",
    });

    // in case of error
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to download LiteLLM catalog (${response.status}): ${errorText}`,
      );
    }

    // store in memory and return
    return (await response.json()) as LiteLlmCatalog;
  })().catch((err) => {
    // reset cache on error so next call can retry
    catalogPromise = null;
    throw err;
  });

  // return
  return catalogPromise;
}

// functions ---------------------------------
/**
 * Look up capability and token details for any model from LiteLLM.
 * Example: await getLiteLlmModelDetails("gpt-4o", "openai")
 */
export async function getLiteLlmModelDetails(
  modelId: string,
  provider?: string,
): Promise<LiteLlmModelEntry | undefined> {
  const catalog = await loadCatalog();

  // Try direct match
  if (catalog[modelId]) {
    return catalog[modelId];
  }

  // Try provider-prefixed match (e.g. "openai/gpt-4o" or "xai/grok-2")
  if (provider) {
    const prefixed = `${provider}/${modelId}`;
    if (catalog[prefixed]) {
      return catalog[prefixed];
    }
  }

  // Try stripped match preserving nested slashes if modelId already had a slash
  if (modelId.includes("/")) {
    const bare = modelId.split("/").slice(1).join("/");
    if (bare && catalog[bare]) {
      return catalog[bare];
    }
  }

  // Try matching by trailing model slug (case-insensitive)
  const lowerId = modelId.toLowerCase();
  for (const [key, entry] of Object.entries(catalog)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey === lowerId ||
      lowerKey.endsWith(`/${lowerId}`) ||
      lowerKey.split("/").pop() === lowerId
    ) {
      return entry;
    }
  }

  // Fallback prefix match: find closest base model match
  const bareLowerId = lowerId.includes("/") ? lowerId.split("/").pop()! : lowerId;
  if (!provider || bareLowerId.length >= 6) {
    let bestMatch: LiteLlmModelEntry | undefined;
    let bestLength = Infinity;
    for (const [key, entry] of Object.entries(catalog)) {
      const bareKey = (key.includes("/") ? key.split("/").pop()! : key).toLowerCase();
      if (
        (bareKey === bareLowerId || bareKey.startsWith(`${bareLowerId}-`)) &&
        bareKey.length < bestLength
      ) {
        bestMatch = entry;
        bestLength = bareKey.length;
      }
    }
    if (bestMatch) return bestMatch;
  }

  return undefined;
}
