import { getOpenAiCatalog } from "./providers/openai";
import { getOpenRouterCatalog } from "./providers/openrouter";
import { getXAiCatalog } from "./providers/xai";
import { getGoogleCatalog } from "./providers/google";
import { getVercelCatalog } from "./providers/vercel";
import { CatalogSchema, type CatalogModel } from "./types";
import { getGroqCatalog } from "./providers/groq";
import { getTogetherCatalog } from "./providers/together";
import { getFireworksCatalog } from "./providers/fireworks";
import { getPoeCatalog } from "./providers/poe";
import { getMistralCatalog } from "./providers/mistral";
import { getCerebrasCatalog } from "./providers/cerebras";
import { getElevenLabsCatalog } from "./providers/elevenlabs";
import { getNvidiaCatalog } from "./providers/nvidia";
import { getCohereCatalog } from "./providers/cohere";
import { getAlibabaCatalog } from "./providers/alibaba";
import { getNinjaChatCatalog } from "./providers/ninjachat";
import { getOpenCodeCatalog } from "./providers/opencode";
import { getAnthropicCatalog } from "./providers/anthropic";
import { getNoKeepCatalog } from "./providers/nokeep";

// constants ---------------------------------
const OUTPUT_PATH = "./catalog.json";

const PROVIDERS = [
  { name: "OpenAI", fetcher: getOpenAiCatalog },
  { name: "xAI", fetcher: getXAiCatalog },
  { name: "Google AI Studio", fetcher: getGoogleCatalog },
  { name: "OpenRouter", fetcher: getOpenRouterCatalog },
  { name: "Vercel AI Gateway", fetcher: getVercelCatalog },
  { name: "Groq", fetcher: getGroqCatalog },
  { name: "Together AI", fetcher: getTogetherCatalog },
  { name: "Fireworks AI", fetcher: getFireworksCatalog },
  { name: "Poe", fetcher: getPoeCatalog },
  { name: "Mistral", fetcher: getMistralCatalog },
  { name: "Cerebras", fetcher: getCerebrasCatalog },
  { name: "ElevenLabs", fetcher: getElevenLabsCatalog },
  { name: "NVIDIA NIM", fetcher: getNvidiaCatalog },
  { name: "Cohere", fetcher: getCohereCatalog },
  { name: "Alibaba", fetcher: getAlibabaCatalog },
  { name: "NinjaChat", fetcher: getNinjaChatCatalog },
  { name: "OpenCode", fetcher: getOpenCodeCatalog },
  { name: "Anthropic", fetcher: getAnthropicCatalog },
  { name: "NoKeep", fetcher: getNoKeepCatalog },
];

// functions ---------------------------------
/**
 * Main function to build the whole catalog by fetching all providers concurrently
 */
async function buildCatalog(): Promise<void> {
  console.log("Building model catalog...");

  // Fetch all providers in parallel
  const results = await Promise.all(
    PROVIDERS.map(async ({ name, fetcher }) => {
      try {
        console.log(`Fetching & hydrating ${name} models...`);
        const models = await fetcher();
        console.log(`Loaded ${models.length} ${name} models.`);
        return models;
      } catch (error) {
        console.error(`Failed to build ${name} catalog:`, error);
        throw error;
      }
    }),
  );

  const models: CatalogModel[] = results.flat();

  // Sort deterministically by provider_id, then id
  models.sort((a, b) => {
    if (a.provider_id !== b.provider_id) {
      return a.provider_id.localeCompare(b.provider_id);
    }
    return a.id.localeCompare(b.id);
  });

  // Construct root catalog container
  const rawCatalog = {
    version: 1,
    updated_at: new Date().toISOString(),
    total_models: models.length,
    models,
  };

  // Validate entire catalog against Zod schema
  const catalog = CatalogSchema.parse(rawCatalog);

  // Write to catalog.json
  await Bun.write(OUTPUT_PATH, JSON.stringify(catalog, null, 2));

  console.log(
    `Successfully generated ${OUTPUT_PATH} with ${catalog.total_models} models!`,
  );
}

buildCatalog().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
