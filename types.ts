/**
 * this contains zod schema to keep proper structure and type safety of the catalog
 */

import { z } from "zod";

// enums -------------------------------
export const ModalitySchema = z.enum([
  "text",
  "image",
  "audio",
  "video",
  "file",
  "embedding",
]);

export const ReasoningTypeSchema = z.enum([
  "effort", // OpenAI: low, medium, high
  "budget", // Claude / Gemini: token budget number
  "toggle", // Gemini / DeepSeek: boolean on/off
  "fixed", // Model always reasons, no parameters (e.g. o1-preview)
]);

export const ReasoningEffortLevelSchema = z.enum([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

// schemas -------------------------------------
export const ReasoningConfigSchema = z.object({
  supported: z.boolean().default(false),
  type: ReasoningTypeSchema.nullable().default(null),
  effort_levels: z.array(ReasoningEffortLevelSchema).nullable().default(null), // ["low", "medium", "high"]
  budget_tokens: z
    .object({
      min: z.number(),
      max: z.number(),
      default: z.number(),
    })
    .nullable()
    .default(null),
  can_toggle_off: z.boolean().default(true),
  default_state: z.enum(["enabled", "disabled"]).default("disabled"),
});

// Model Capabilities
export const ModelCapabilitiesSchema = z.object({
  vision: z.boolean().default(false),
  functionCalling: z.boolean().default(false),
  webSearch: z.boolean().default(false),
  codeExecution: z.boolean().default(false),
  realtime: z.boolean().default(false),
  videoReasoning: z.boolean().default(false), // model can understand/analyze video inputs (distinct from video gen output)
  fileInput: z.boolean().default(false),
  supportsStreaming: z.boolean().default(true),
  supportsSystemPrompt: z.boolean().default(true),

  // Advanced Reasoning
  reasoning: ReasoningConfigSchema.default({
    supported: false,
    type: null,
    effort_levels: null,
    budget_tokens: null,
    can_toggle_off: true,
    default_state: "disabled",
  }),
});

// Image Generation (DALL-E, Flux, etc.)
export const ImageOptionsSchema = z.object({
  sizes: z.array(z.string()).default([]), // ["1024x1024", "1024x1792"]
  aspect_ratios: z.array(z.string()).nullable().default(null), // ["1:1", "16:9"]
  qualities: z.array(z.string()).nullable().default(null), // ["standard", "hd"]
  styles: z.array(z.string()).nullable().default(null), // ["vivid", "natural"] for DALL-E 3
  supports_seed: z.boolean().default(false),
  provider_param_key: z.string(),
});

// TTS (Text-to-Speech)
export const TtsVoiceSchema = z.object({
  id: z.string(), // "alloy"
  label: z.string(), // "Alloy"
  gender: z.enum(["male", "female", "neutral"]).nullable().default(null),
});

export const TtsOptionsSchema = z.object({
  voices: z.array(TtsVoiceSchema),
  formats: z.array(z.string()).default([]), // set explicitly per provider/model (e.g. OpenAI supports mp3, opus, aac, flac, wav, pcm)
  speeds: z
    .object({
      min: z.number().default(0.25),
      max: z.number().default(4.0),
    })
    .nullable()
    .default(null),
});

// Video Generation
export const VideoOptionsSchema = z.object({
  durations: z.array(z.number()), // [5, 10]
  aspect_ratios: z.array(z.string()), // ["16:9", "9:16"]
  resolutions: z.array(z.string()), // ["720p", "1080p"]
  default_duration: z.number().default(5),
  default_aspect_ratio: z.string().default("16:9"),
  default_resolution: z.string().default("720p"),
});

// the model schema
export const CatalogModelSchema = z.object({
  provider_id: z.string(), // "openai", "xai", "google", etc.
  id: z.string(), // Exact ID sent in API request: "gpt-4o", "grok-2"
  canonical_id: z.string(), // Unified ID: "openai/gpt-4o", "xai/grok-2"
  name: z.string(), // Clean display name: "GPT-4o"
  origin_provider: z.string(), // Origin family: "openai" (even when accessed via OpenRouter)
  inputs: z.array(ModalitySchema).default(["text"]),
  outputs: z.array(ModalitySchema).default(["text"]),
  capabilities: ModelCapabilitiesSchema,
  // Specialized feature configs (null if model doesn't support that modality)
  image_options: ImageOptionsSchema.nullable().default(null),
  tts_options: TtsOptionsSchema.nullable().default(null),
  video_options: VideoOptionsSchema.nullable().default(null),
  // Token Limits
  context_length: z.number().int().nullable().default(null), // Max input window
  max_output_tokens: z.number().int().nullable().default(null), // Max generation limit
  description: z.string().nullable().default(null),
  tags: z.array(z.string()).default([]),
  is_deprecated: z.boolean().default(false),
});

// The Generated File Container (catalog.json)
export const CatalogSchema = z.object({
  version: z.number().default(1),
  updated_at: z.string(),
  total_models: z.number(),
  models: z.array(CatalogModelSchema),
});

// types ----------------------
export type Modality = z.infer<typeof ModalitySchema>;
export type ReasoningType = z.infer<typeof ReasoningTypeSchema>;
export type ReasoningEffortLevel = z.infer<typeof ReasoningEffortLevelSchema>;
export type ReasoningConfig = z.infer<typeof ReasoningConfigSchema>;
export type ModelCapabilities = z.infer<typeof ModelCapabilitiesSchema>;
export type ImageOptions = z.infer<typeof ImageOptionsSchema>;
export type TtsVoice = z.infer<typeof TtsVoiceSchema>;
export type TtsOptions = z.infer<typeof TtsOptionsSchema>;
export type VideoOptions = z.infer<typeof VideoOptionsSchema>;
export type CatalogModel = z.infer<typeof CatalogModelSchema>;
export type Catalog = z.infer<typeof CatalogSchema>;
