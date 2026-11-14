// this file provides env in a type safe way

import { config } from "dotenv";
import { z } from "zod";

config();

// main schema
const EnvSchema = z.object({
  OPENAI_API_KEY: z.string(),
  XAI_API_KEY: z.string(),
  OPENROUTER_API_KEY: z.string().optional(),
});

export type ENV = z.infer<typeof EnvSchema>;

const { data: env, error } = EnvSchema.safeParse(process.env);
if (error) {
  console.error("Invalid environment variables: ", error.flatten());
  process.exit(1);
}
//export type safe env
export default env as ENV;
