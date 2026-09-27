/**
 * Serve a directory over http so a local file can be opened in a tab.
 *
 * The blind spot this closes is narrow and real: `browser.tabs.open` accepts only http(s) and
 * about:blank, so a file on disk cannot be opened in a tab, and an agent that does not know that
 * spends a turn discovering it through an error. The remedy is not a rule to remember, it is a
 * URL to use.
 *
 * Bind is 127.0.0.1 only. Serving a source tree on every interface would be a security problem,
 * and nothing here needs it. Every resolved path is checked against the root, so a request cannot
 * walk out of the directory it was given.
 *
 *   node eval/serve.mjs <dir> [--port 0]
 *
 * Port 0 asks the OS for a free one, which is what an agent on a busy machine should use; the
 * chosen URL is printed. Runs until interrupted.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const args = process.argv.slice(2);
const rootArg = args.find((a) => !a.startsWith("--"));
const portArg = args.indexOf("--port");
const port = portArg === -1 ? 0 : Number(args[portArg + 1]);

if (!rootArg) {
  console.error("usage: node eval/serve.mjs <dir> [--port 0]");
  process.exit(1);
}

const ROOT = path.resolve(rootArg);
if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
  console.error(`serve: ${ROOT} is not a directory`);
  process.exit(1);
}

/** Resolve a request path inside the root, or refuse it. Traversal is the whole risk here. */
function resolveInside(requestPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(requestPath.split("?")[0].split("#")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const resolved = path.resolve(ROOT, `.${path.posix.normalize(decoded)}`);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  return resolved;
}

function send(target, response) {
  fs.readFile(target, (error, body) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("not found");
      return;
    }
    response.writeHead(200, {
      "content-type": TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  });
}

const server = http.createServer((request, response) => {
  if (request.url === "/") {
    // A directory with no index.html is the common case for a page someone just wrote, and a 404
    // at the root reads as "the server is broken". Serve the one page, or say what is there.
    const index = path.join(ROOT, "index.html");
    if (fs.existsSync(index)) return send(index, response);
    const pages = fs.readdirSync(ROOT).filter((name) => /\.html?$/i.test(name));
    if (pages.length === 1) return send(path.join(ROOT, pages[0]), response);
    const list = pages.length
      ? pages.map((name) => `<li><a href="/${encodeURIComponent(name)}">${name}</a></li>`).join("")
      : "<li>no HTML files here</li>";
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(`<!doctype html><meta charset="utf-8"><title>index</title><h1>${path.basename(ROOT)}</h1><ul>${list}</ul>`);
    return;
  }

  const target = resolveInside(request.url);
  if (!target) {
    response.writeHead(403, { "content-type": "text/plain" });
    response.end("forbidden: outside the served directory");
    return;
  }
  return send(target, response);
});

server.listen(port, "127.0.0.1", () => {
  const chosen = server.address().port;
  console.log(`serving ${ROOT}`);
  console.log(`  http://127.0.0.1:${chosen}/`);
  console.log("  a local file cannot be opened in a tab with a file:// URL; use this one");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
