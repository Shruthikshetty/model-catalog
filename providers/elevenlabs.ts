import env from "../env";
import { URL } from "../constants";
import {
  TtsVoiceSchema,
  type CatalogModel,
  type Modality,
  type TtsOptions,
  type TtsVoice,
} from "../types";
import { cleanDisplayName } from "../utils/format";

// types -------------------------------------

export type ElevenLabsRawModelLanguage = {
  language_id?: string;
  name?: string;
};

/**
 * Shape of raw model object returned by ElevenLabs `/v1/models` endpoint.
 * Source: https://elevenlabs.io/docs/api-reference/models
 */
export type ElevenLabsRawModel = {
  model_id: string;
  name?: string;
  description?: string;
  can_do_text_to_speech?: boolean;
  can_do_voice_conversion?: boolean;
  can_use_style?: boolean;
  can_use_speaker_boost?: boolean;
  serves_pro_voices?: boolean;
  token_cost_factor?: number;
  maximum_text_length_per_request?: number;
  languages?: ElevenLabsRawModelLanguage[];
  [key: string]: unknown;
};

export type ElevenLabsRawVoice = {
  voice_id: string;
  name: string;
  category?: string;
  description?: string;
  labels?: {
    gender?: string;
    accent?: string;
    age?: string;
    use_case?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type ElevenLabsVoicesResponse = {
  voices: ElevenLabsRawVoice[];
};

// constants ---------------------------------

export const ELEVENLABS_TTS_FORMATS = [
  "mp3_44100_128",
  "mp3_44100_192",
  "pcm_16000",
  "pcm_22050",
  "pcm_24000",
  "pcm_44100",
  "ulaw_8000",
  "alaw_8000",
  "opus_codecs",
];

export const ELEVENLABS_TTS_SPEEDS = {
  min: 0.5,
  max: 2.0,
};

// functions ---------------------------------

/**
 * Fetches the raw models list from ElevenLabs API
 */
export async function fetchElevenLabsModels(): Promise<ElevenLabsRawModel[]> {
  const response = await fetch(URL.ELEVENLABS_MODELS, {
    method: "GET",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch models from ElevenLabs API (${response.status}): ${errorText}`,
    );
  }

  const json = (await response.json()) as ElevenLabsRawModel[];
  return Array.isArray(json) ? json : [];
}

/**
 * Fetches the available voices from ElevenLabs API
 */
export async function fetchElevenLabsVoices(): Promise<TtsVoice[]> {
  const response = await fetch(URL.ELEVENLABS_VOICES, {
    method: "GET",
    headers: {
      "xi-api-key": env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    return [];
  }

  const json = (await response.json()) as ElevenLabsVoicesResponse;
  const rawVoices = json.voices || [];

  return TtsVoiceSchema.array().parse(rawVoices.map((v) => {
    let gender: "male" | "female" | "neutral" | undefined;
    const g = v.labels?.gender?.toLowerCase();
    if (g === "female") gender = "female";
    else if (g === "male") gender = "male";
    else if (g === "neutral") gender = "neutral";

    return {
      id: v.voice_id,
      label: v.name,
      ...(gender ? { gender } : {}),
    };
  }));
}

/**
 * Main generator that fetches ElevenLabs voice models and available voices,
 * standardizing them into CatalogModel entries.
 */
export async function getElevenLabsCatalog(): Promise<CatalogModel[]> {
  const [rawModels, voices] = await Promise.all([
    fetchElevenLabsModels(),
    fetchElevenLabsVoices(),
  ]);

  const catalogModels: CatalogModel[] = [];

  const defaultTtsOptions: TtsOptions = {
    voices,
    formats: ELEVENLABS_TTS_FORMATS,
    speeds: ELEVENLABS_TTS_SPEEDS,
  };

  for (const raw of rawModels) {
    const modelId = raw.model_id;
    const isVoiceConversion = Boolean(raw.can_do_voice_conversion);

    // Inputs: text (and audio if speech-to-speech / voice conversion)
    const inputs: Modality[] = ["text"];
    if (isVoiceConversion) {
      inputs.push("audio");
    }

    // Outputs: audio
    const outputs: Modality[] = ["audio"];

    // Tags
    const tags: string[] = ["audio", "tts"];
    if (isVoiceConversion) tags.push("sts", "voice-conversion");

    const catalogModel: CatalogModel = {
      providerId: "elevenlabs",
      id: modelId,
      canonicalId: `elevenlabs/${modelId}`,
      name: raw.name || cleanDisplayName(modelId),
      originProvider: "elevenlabs",
      inputs,
      outputs,
      capabilities: {
        vision: false,
        functionCalling: false,
        webSearch: false,
        codeExecution: false,
        realtime: true,
        videoReasoning: false,
        fileInput: false,
        supportsStreaming: true,
        supportsSystemPrompt: false,
        reasoning: {
          supported: false,
          type: null,
          effortLevels: null,
          budgetTokens: null,
          canToggleOff: true,
          defaultState: "disabled",
        },
      },
      imageOptions: null,
      ttsOptions: defaultTtsOptions,
      videoOptions: null,
      contextLength: raw.maximum_text_length_per_request ?? null,
      maxOutputTokens: null,
      description: raw.description ?? null,
      tags,
      isDeprecated: false,
    };

    catalogModels.push(catalogModel);
  }

  return catalogModels;
}
