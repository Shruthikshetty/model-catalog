/**
 * Lightweight local server to view catalog.json in index.html
 */

// constants ---------------------------------
const PORT = Number(process.env.PORT) || 3000;

// functions ---------------------------------
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/favicon.ico") {
      return new Response(null, { status: 204 });
    }

    const filePath = url.pathname === "/" ? "./index.html" : `.${url.pathname}`;
    const file = Bun.file(filePath);

    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return new Response(file);
  },
});

console.log(`Model Catalog Viewer is running at: http://localhost:${server.port}`);
