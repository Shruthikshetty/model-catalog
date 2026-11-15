/**
 * Central constants for API endpoints, registry URLs, and shared configurations.
 */

export const URL = {
  OPENAI_MODELS: "https://api.openai.com/v1/models",
  XAI_MODELS: "https://api.x.ai/v1/models",
  LITELLM_MODELS:
    "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
  OPENROUTER_MODELS: "https://openrouter.ai/api/v1/models",
  GOOGLE_MODELS: "https://generativelanguage.googleapis.com/v1beta/models",
  VERCEL_MODELS: "https://ai-gateway.vercel.sh/v1/models",
  GROQ_MODELS: "https://api.groq.com/openai/v1/models",
} as const;
