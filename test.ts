import { getElevenLabsCatalog } from "./providers/elevenlabs";
import { CatalogModelSchema } from "./types";

async function main() {
  console.log("Building ElevenLabs catalog...");
  const models = await getElevenLabsCatalog();
  console.log(`Loaded ${models.length} ElevenLabs catalog models.`);

  let allValid = true;
  for (const m of models) {
    const res = CatalogModelSchema.safeParse(m);
    if (!res.success) {
      console.error(`Validation failed for ${m.id}:`, res.error.format());
      allValid = false;
    }
  }

  if (allValid) {
    console.log("All ElevenLabs models passed CatalogModelSchema validation!");
  }

  // Print sample
  console.log("\n--- Sample TTS Model ---");
  console.log(JSON.stringify(models[0], null, 2));
}

main();
