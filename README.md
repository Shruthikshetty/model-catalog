# AI Model Catalog

> A unified, automated registry and capability database for AI models across providers. Normalizes model IDs, context windows, token limits, and multimodal options into a single source of truth.

---

## 🌐 Public Endpoints

* **Interactive Catalog Viewer**: [https://shruthikshetty.github.io/model-catalog/](https://shruthikshetty.github.io/model-catalog/)
* **Static Catalog JSON API**: [https://shruthikshetty.github.io/model-catalog/catalog.json](https://shruthikshetty.github.io/model-catalog/catalog.json)

---

## 🚀 How It Works

1. **Provider Extraction**: Discovers canonical models directly from AI provider APIs (OpenAI, xAI, Google AI Studio, Vercel AI Gateway, OpenRouter, Groq, Together AI, Fireworks AI, Poe, etc.).
2. **Metadata Hydration**: Enriches models with token limits (`context_length`, `max_output_tokens`) and capability flags (`vision`, `functionCalling`, `reasoning`) from verified reference registries.
3. **Multimodal Configurations**: Standardizes feature options for image generation (dimensions, aspect ratios, qualities) and text-to-speech (voices, audio formats).
4. **Zod Validation**: Validates every entry against strict type schemas defined in `types.ts`.
5. **Static Distribution**: Generates a single, lightweight `catalog.json` and deploys to GitHub Pages for instant consumption by web, desktop, and mobile applications.

---

## 💻 Local Development

### Prerequisites
* [Bun](https://bun.com) (v1.3+ recommended)

### 1. Install dependencies
```bash
bun install
```

### 2. Configure environment (required for building the catalog)
Create a `.env` file at the root:
```env
OPENAI_API_KEY=your_key_here
XAI_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
GROQ_API_KEY=your_key_here
TOGETHER_API_KEY=your_key_here
FIREWORKS_API_KEY=your_key_here
OPENROUTER_API_KEY=your_key_here # optional
```

### 3. Build the catalog
```bash
bun run build
```
Fetches models, hydrates capabilities, and updates `./catalog.json`.

### 4. View the catalog locally
```bash
bun run view
```
Launches the interactive web viewer at [http://localhost:3000](http://localhost:3000) with instant search and modality filters.
