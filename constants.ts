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
  TOGETHER_MODELS: "https://api.together.ai/v1/models",
  FIREWORKS_MODELS: "https://api.fireworks.ai/inference/v1/models",
  POE_MODELS: "https://api.poe.com/v1/models",
  MISTRAL_MODELS: "https://api.mistral.ai/v1/models",
  CEREBRAS_MODELS: "https://api.cerebras.ai/v1/models",
  ELEVENLABS_MODELS: "https://api.elevenlabs.io/v1/models",
  ELEVENLABS_VOICES: "https://api.elevenlabs.io/v1/voices",
  NVIDIA_MODELS: "https://integrate.api.nvidia.com/v1/models",
  COHERE_MODELS: "https://api.cohere.com/v1/models",
  ALIBABA_MODELS: "https://dashscope-intl.aliyuncs.com/api/v1/models",
  NINJACHAT_MODELS: "https://www.ninjachat.ai/api/v1/models",
  OPENCODE_MODELS: "https://opencode.ai/zen/v1/models",
  ANTHROPIC_MODELS: "https://api.anthropic.com/v1/models",
} as const;
