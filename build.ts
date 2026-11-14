import { getOpenAiCatalog } from "./providers/openai";
import { CatalogSchema, type CatalogModel } from "./types";

/**
 * main function to build the whole catalog
 */
async function buildCatalog(): Promise<void> {
  console.log("Building model catalog...");

  // Collect models from all providers (starting with OpenAI)
  const models: CatalogModel[] = [];

  try {
    console.log("Fetching & hydrating OpenAI models...");
    // @TODO late rdo a parallel operation
    const openAiModels = await getOpenAiCatalog();
    models.push(...openAiModels);
    console.log(`Loaded ${openAiModels.length} OpenAI models.`);
  } catch (error) {
    console.error("Failed to build OpenAI catalog:", error);
    process.exit(1);
  }

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
  const outputPath = "./catalog.json";
  await Bun.write(outputPath, JSON.stringify(catalog, null, 2));

  console.log(
    `Successfully generated ${outputPath} with ${catalog.total_models} models!`,
  );
}

buildCatalog().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
