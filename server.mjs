import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import { extname, resolve } from "node:path";

const distDir = resolve(process.cwd(), "dist");
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function resolveAssetPath(pathname) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const candidate = resolve(distDir, `.${requestPath}`);
  if (!candidate.startsWith(distDir)) {
    return null;
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    return candidate;
  }
  return resolve(distDir, "index.html");
}

function sendFile(response, filePath) {
  const extension = extname(filePath);
  const contentType = mimeTypes[extension] ?? "application/octet-stream";
  response.writeHead(200, { "Content-Type": contentType });
  createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");

  if (url.pathname === "/health") {
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end('{"status":"ok"}');
    return;
  }

  const filePath = resolveAssetPath(url.pathname);
  if (!filePath || !existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  sendFile(response, filePath);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Frontend server is listening on port ${port}`);
});
