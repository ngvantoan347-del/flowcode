/**
 * The browser check, proven in both directions.
 *
 * This lives in its own file on purpose. The plugin tests redirect USERPROFILE and HOME to a
 * sandbox so they never touch the real state directory, and a browser started under a redirected
 * home cannot initialise: it took 30s and failed with EPERM, against 1.7s and a clean pass with a
 * real home. A test must not change the environment of the thing it is testing, so the fixture
 * that belongs to the plugin stays with the plugin.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { after, before, describe, test } from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CHECKER = path.join(ROOT, "eval", "page-check.mjs");

let workdir;

before(() => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), "flowcode-page-"));
});

after(() => {
  fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
});

const run = (...args) =>
  spawnSync(process.execPath, [CHECKER, ...args], { encoding: "utf8", timeout: 120_000, cwd: workdir });

describe("browser verification", () => {
  test("a clean page passes and a page that logs to the console fails", (t) => {
    // A capability nobody can prove wrong is decoration. Both directions, every run.
    const good = path.join(workdir, "good.html");
    const broken = path.join(workdir, "broken.html");
    fs.writeFileSync(
      good,
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>ok</title><body><h1>Fine</h1></body>',
      "utf8",
    );
    fs.writeFileSync(
      broken,
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>t</title><body><h1>hi</h1><script>console.error("boom")</script></body>',
      "utf8",
    );

    const pass = run(good, "--width", "360");
    const fail = run(broken, "--width", "360");
    if (pass.status === 77) {
      t.skip("no browser on this machine; the check reports 77 rather than pretending");
      return;
    }
    assert.equal(pass.status, 0, `a clean page must pass:\n${pass.stdout}${pass.stderr}`);
    assert.equal(fail.status, 1, `a page logging to the console must fail:\n${fail.stdout}`);
    assert.match(fail.stdout, /console error/, "and it must name what was wrong");
  });

  test("a page that overflows a phone viewport fails", (t) => {
    const wide = path.join(workdir, "wide.html");
    fs.writeFileSync(wide, "<!doctype html><title>t</title><body><div style='width:1200px'>wide</div></body>", "utf8");
    const result = run(wide, "--width", "360");
    if (result.status === 77) {
      t.skip("no browser on this machine");
      return;
    }
    assert.equal(result.status, 1, `a page that cannot fit a phone must fail:\n${result.stdout}`);
    assert.match(result.stdout, /horizontal overflow/i);
  });

  test("a missing capability is reported, never passed", (t) => {
    // Proven where puppeteer-core cannot resolve: its own code, not a pass and not a defect.
    const iso = fs.mkdtempSync(path.join(os.tmpdir(), "flowcode-iso-"));
    try {
      fs.copyFileSync(CHECKER, path.join(iso, "page-check.mjs"));
      fs.writeFileSync(path.join(iso, "p.html"), "<!doctype html><body><h1>x</h1></body>", "utf8");
      const result = spawnSync(process.execPath, [path.join(iso, "page-check.mjs"), "p.html"], {
        encoding: "utf8",
        timeout: 60_000,
      });
      if (result.status === 0) {
        t.skip("puppeteer-core resolved from outside the sandbox");
        return;
      }
      assert.equal(result.status, 77, "capability absent has its own code");
      assert.match(result.stdout, /cannot run/);
    } finally {
      fs.rmSync(iso, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }
  });
});
