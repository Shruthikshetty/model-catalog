/**
 * Lightweight local server to view catalog.json in index.html
 */

// constants ---------------------------------
const PORT = Number(process.env.PORT) || 3000;

const ALLOWED_FILES: Record<string, string> = {
  "/": "./index.html",
  "/index.html": "./index.html",
  "/catalog.json": "./catalog.json",
};

// functions ---------------------------------
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    const filePath = ALLOWED_FILES[url.pathname];
    if (!filePath) {
      return new Response("Not Found", { status: 404 });
    }

    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(
  `\n🚀 Model Catalog Viewer is running at: http://localhost:${server.port}`,
);
console.log(`   Press Ctrl+C to stop.\n`);
