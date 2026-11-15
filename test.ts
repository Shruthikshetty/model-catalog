import { getTogetherCatalog } from "./providers/together";
import { CatalogModelSchema } from "./types";

async function main() {
  console.log("Building Together AI catalog...");
  const models = await getTogetherCatalog();
  console.log(`Loaded ${models.length} Together AI catalog models.`);

  let allValid = true;
  let validationErrors = 0;
  for (const m of models) {
    const res = CatalogModelSchema.safeParse(m);
    if (!res.success) {
      console.error(`Validation failed for ${m.id}:`, res.error.format());
      allValid = false;
      validationErrors++;
    }
  }

  if (allValid) {
    console.log("All Together AI models passed CatalogModelSchema validation!");
  } else {
    console.log(`Total models with validation errors: ${validationErrors}`);
  }

  // Print a few sample models of different types
  const chatSample = models.find((m) => m.tags.includes("chat"));
  const imageSample = models.find((m) => m.tags.includes("image"));
  const audioSample = models.find((m) => m.tags.includes("audio"));

  console.log("\n--- Sample Chat Model ---", chatSample);
  if (imageSample) console.log("\n--- Sample Image Model ---", imageSample);
  if (audioSample) console.log("\n--- Sample Audio Model ---", audioSample);
}

main();
