"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

http.createServer((request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }

  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname); }
  catch { response.writeHead(400).end("Bad request"); return; }

  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const file = path.resolve(root, relative);
  const relativePath = path.relative(root, file);
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  const segments = relativePath.split(path.sep);
  const allowed = segments.length === 1
    ? ["index.html", "manifest.json", "service-worker.js", "favicon.ico", "favicon.svg"].includes(segments[0])
    : segments.length === 2 && ["css", "js"].includes(segments[0]) && /\.(css|js)$/.test(segments[1]);
  if (!allowed) { response.writeHead(404).end("Not found"); return; }

  fs.stat(file, (statError, stat) => {
    if (statError || !stat.isFile()) { response.writeHead(404).end("Not found"); return; }
    response.writeHead(200, {
      "Content-Type": mime[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Content-Length": stat.size
    });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(file).pipe(response);
  });
}).listen(8080, "127.0.0.1", () => {
  console.log("CAP SAVOIR MANAGER disponible sur http://localhost:8080");
});
