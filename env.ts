// this file provides env in a type safe way

import { z } from "zod";

// main schema
const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  XAI_API_KEY: z.string().min(1),
  OPENROUTER_API_KEY: z
    .string()
    .optional()
    .transform((val) => (val === "" ? undefined : val)),
  GEMINI_API_KEY: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  TOGETHER_API_KEY: z.string().min(1),
  FIREWORKS_API_KEY: z.string().min(1),
  MISTRAL_API_KEY: z.string().min(1),
  CEREBRAS_API_KEY: z.string().min(1),
  ELEVENLABS_API_KEY: z.string().min(1),
});

export type ENV = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(
    "Invalid or missing environment variables:\n" +
      z.prettifyError(parsed.error),
  );
  process.exit(1);
}

// export type safe env
export default parsed.data as ENV;
