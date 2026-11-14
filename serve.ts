/**
 * Lightweight local server to view catalog.json in index.html
 */
const port = Number(process.env.PORT) || 3000;

const server = Bun.serve({
  port,
  fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file("." + path);
    return new Response(file);
  },
});

console.log(`Model Catalog Viewer is running at: http://localhost:${server.port}`);
