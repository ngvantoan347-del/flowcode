/**
 * The local-file server, proven where it matters: a file on disk reachable over http, and nothing
 * above the root reachable at all. No browser needed, so this runs everywhere the suite runs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVER = path.join(ROOT, "eval", "serve.mjs");

let child;
let origin;
let root;

before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "flowcode-serve-"));
  fs.writeFileSync(path.join(root, "page.html"), "<!doctype html><title>served</title><h1>hi</h1>", "utf8");
  fs.writeFileSync(path.join(root, "style.css"), "h1{color:red}", "utf8");
  // One level above the served directory: a response containing this would be a real escape.
  fs.writeFileSync(path.join(path.dirname(root), "secret.txt"), "do not serve me", "utf8");

  origin = await new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [SERVER, root, "--port", "0"], { stdio: ["ignore", "pipe", "inherit"] });
    child = proc;
    const timer = setTimeout(() => reject(new Error("the server never announced its URL")), 10_000);
    proc.stdout.on("data", (chunk) => {
      const match = /(http:\/\/127\.0\.0\.1:\d+)/.exec(String(chunk));
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
});

after(() => {
  child?.kill();
  if (root) {
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    fs.rmSync(path.join(path.dirname(root), "secret.txt"), { force: true });
  }
});

describe("serving a local file", () => {
  test("a file is reachable over http, at the root and by name", async () => {
    const atRoot = await fetch(`${origin}/`);
    assert.equal(atRoot.status, 200);
    assert.match(atRoot.headers.get("content-type") ?? "", /text\/html/);
    assert.match(await atRoot.text(), /<h1>hi<\/h1>/);

    const byName = await fetch(`${origin}/page.html`);
    assert.equal(byName.status, 200);
    const css = await fetch(`${origin}/style.css`);
    assert.match(css.headers.get("content-type") ?? "", /text\/css/);
  });

  test("nothing above the served directory is reachable, however it is spelled", async () => {
    for (const attempt of ["/../secret.txt", "/..%2Fsecret.txt", "/%2e%2e/secret.txt", "/....//secret.txt", "/%2e%2e%2f%2e%2e%2fsecret.txt"]) {
      const response = await fetch(`${origin}${attempt}`);
      const body = await response.text();
      assert.notEqual(response.status, 200, `${attempt} returned a file`);
      assert.doesNotMatch(body, /do not serve me/, `${attempt} leaked a file above the root`);
    }
  });

  test("a missing file is a 404, not a silent empty page", async () => {
    assert.equal((await fetch(`${origin}/nope.html`)).status, 404);
  });
});
