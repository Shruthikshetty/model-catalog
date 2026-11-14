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
let cachedCatalog: LiteLlmCatalog | null = null;

// utils -------------------------------------
/**
 * Loads the raw LiteLLM catalog once and caches it in memory.
 */
async function loadCatalog(): Promise<LiteLlmCatalog> {
  // in case already in memory then return it
  if (cachedCatalog) {
    return cachedCatalog;
  }

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

  // store in memory
  cachedCatalog = (await response.json()) as LiteLlmCatalog;
  // return
  return cachedCatalog;
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

  // Try stripped match if modelId already had a slash
  if (modelId.includes("/")) {
    const bareId = modelId.split("/")[1];
    if (bareId && catalog[bareId]) {
      return catalog[bareId];
    }
  }

  // Try matching by trailing model slug (e.g. "aiml/dall-e-3" matches "dall-e-3")
  const suffixMatch = Object.keys(catalog).find((key) => {
    return key.endsWith(`/${modelId}`) || key.split("/").pop() === modelId;
  });
  if (suffixMatch) {
    return catalog[suffixMatch];
  }

  // Fallback prefix match (some entries have version suffix)
  const candidateKey = Object.keys(catalog).find((key) => {
    return (
      key === modelId ||
      key.startsWith(`${modelId}-`) ||
      (provider && key.startsWith(`${provider}/${modelId}`))
    );
  });

  return candidateKey ? catalog[candidateKey] : undefined;
}
