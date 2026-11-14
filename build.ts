import { getOpenAiCatalog } from "./providers/openai";
import { getOpenRouterCatalog } from "./providers/openrouter";
import { getXAiCatalog } from "./providers/xai";
import { getGoogleCatalog } from "./providers/google";
import { CatalogSchema, type CatalogModel } from "./types";

// constants ---------------------------------
const OUTPUT_PATH = "./catalog.json";

const PROVIDERS = [
  { name: "OpenAI", fetcher: getOpenAiCatalog },
  { name: "xAI", fetcher: getXAiCatalog },
  { name: "Google AI Studio", fetcher: getGoogleCatalog },
  { name: "OpenRouter", fetcher: getOpenRouterCatalog },
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
