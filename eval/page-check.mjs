/**
 * A real check for work that has no test suite: does the page actually render?
 *
 * The blind spot this fills is specific. A landing page, a document, a config — the work has no
 * failing test, so "run the tests" is not available and a model left with only that will either
 * skip verification or invent a loop of looking at itself. This asks the question a browser can
 * answer and a text diff cannot: does it load, does it log anything to the console, does anything
 * 404, and does it survive a narrow viewport.
 *
 * It uses a browser already installed on the machine rather than downloading one, because the
 * ground is usually already here. Override with CHROME_PATH if it is somewhere unusual.
 *
 *   node eval/page-check.mjs <file-or-url> [--width 360]
 *
 * Exit codes, and the distinction matters: 0 rendered clean, 1 a real defect, 77 the capability
 * is absent (no puppeteer-core, no browser binary). 77 is never reported as a pass.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CAPABILITY_ABSENT = 77;
const WINDOWS = process.platform === "win32";

const BROWSER_PATHS = WINDOWS
  ? [
      process.env.CHROME_PATH,
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    ]
  : [
      process.env.CHROME_PATH,
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ];

const absent = (what) => {
  console.log(`page-check: cannot run — ${what}`);
  process.exit(CAPABILITY_ABSENT);
};

sweepStaleProfiles();

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const widthArg = args.indexOf("--width");
const width = widthArg === -1 ? 360 : Number(args[widthArg + 1]);
if (!target) {
  console.error("usage: node page-check.mjs <file-or-url> [--width 360]");
  process.exit(1);
}

const executablePath = BROWSER_PATHS.filter(Boolean).find((p) => fs.existsSync(p));
if (!executablePath) absent("no browser binary found; set CHROME_PATH");

let puppeteer;
try {
  // Lazy and optional: the setup must stay install-free, so nothing here may run at import time.
  ({ default: puppeteer } = await import("puppeteer-core"));
} catch {
  absent("puppeteer-core is not installed (npm install --save-dev puppeteer-core)");
}

const url = /^https?:|^file:/.test(target) ? target : pathToFileURL(path.resolve(target)).href;
if (!/^https?:|^file:/.test(url)) {
  console.error(`page-check: cannot address ${target}`);
  process.exit(1);
}
// Fail before launching a browser: a missing file is a fact about the file, and saying so is more
// useful than a driver-level error about the page it was asked to open.
if (!/^https?:/.test(url) && !fs.existsSync(path.resolve(target))) {
  console.log(`DEFECT  ${target} does not exist`);
  process.exit(1);
}

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
/** Launch with a profile nobody else can be using. Chrome's process singleton is a Windows file
 *  lock, and under load a brand new profile can still collide with one that is shutting down; the
 *  remedy is bounded and honest — a second attempt with a fresh profile, and a real failure if
 *  that collides too. */
async function launch() {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "flowcode-browser-"));
    try {
      return { browser: await puppeteer.launch({ executablePath, headless: true, userDataDir: dir }), profile: dir };
    } catch (error) {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
      if (attempt === 2 || !/already running/i.test(error.message)) throw error;
    }
  }
}

let browser;
let profile;

try {
  ({ browser, profile } = await launch());
  const page = await browser.newPage();
  await page.setViewport({ width, height: 800 });

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 200));
  });
  page.on("pageerror", (error) => pageErrors.push(String(error.message ?? error).slice(0, 200)));
  page.on("requestfailed", (request) => {
    // Browsers request a favicon speculatively; a missing one is not a defect in the page.
    if (request.url().includes("favicon")) return;
    failedRequests.push(`${request.url().slice(0, 120)} (${request.failure()?.errorText ?? "failed"})`);
  });

  const response = await page.goto(url, { waitUntil: "load", timeout: 30_000 });
  const measured = await page.evaluate(() => ({
    title: document.title ?? "",
    bodyText: (document.body?.innerText ?? "").trim().length,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  const screenshot = path.join(os.tmpdir(), `page-check-${path.basename(target).replace(/\W+/g, "-")}.${width}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });

  const status = response ? response.status() : 0;
  const overflow = measured.scrollWidth > measured.clientWidth + 1;
  const defects = [
    status >= 400 ? `the page returned HTTP ${status}` : null,
    measured.bodyText === 0 ? "the page rendered no text at all" : null,
    consoleErrors.length ? `${consoleErrors.length} console error(s): ${consoleErrors[0]}` : null,
    pageErrors.length ? `${pageErrors.length} uncaught error(s): ${pageErrors[0]}` : null,
    failedRequests.length ? `${failedRequests.length} failed request(s): ${failedRequests[0]}` : null,
    overflow ? `horizontal overflow at ${width}px: content is ${measured.scrollWidth}px wide in ${measured.clientWidth}px` : null,
  ].filter(Boolean);

  console.log(`rendered   ${url}`);
  console.log(`title      ${measured.title || "(none)"}`);
  console.log(`text       ${measured.bodyText} characters`);
  console.log(`console    ${consoleErrors.length} error(s)`);
  console.log(`requests   ${failedRequests.length} failed, ${pageErrors.length} uncaught`);
  console.log(`viewport   ${width}px, ${overflow ? `OVERFLOW to ${measured.scrollWidth}px` : "no overflow"}`);
  console.log(`screenshot ${screenshot}`);

  if (defects.length === 0) {
    console.log("PASS");
    process.exit(0);
  }
  for (const defect of defects) console.log(`DEFECT  ${defect}`);
  console.log(`FAIL (${defects.length})`);
  process.exit(1);
} catch (error) {
  console.log(`page-check: the browser could not load it — ${error.message}`);
  process.exit(1);
} finally {
  // A verifier that leaks browser processes is not a verifier. close() is not always enough on
  // Windows, and the handle it holds is what blocks deleting the project it just read — so the
  // process this script started is terminated explicitly. Only that one: never a browser the
  // owner is using.
  // A verifier that leaks browser processes is not a verifier. The profile is ours and removed
  // below, so there is nothing to let the library finish: close politely, then insist, because a
  // child that outlives its parent is what pins a directory and grows a footprint per run. Only
  // this process; never a browser the owner is using.
  try {
    await browser?.close();
  } catch {
    // already gone
  }
  const child = browser?.process();
  if (child && child.exitCode === null) {
    try {
      child.kill();
    } catch {
      // it exited between the check and the signal
    }
  }
  if (profile) {
    // Best effort: a live browser holds this directory. Whatever survives is swept next run.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  }
}

/** Remove profiles left by earlier runs. Anything younger than an hour may still belong to a live
 *  browser, so it is left for a later sweep rather than fought over. */
function sweepStaleProfiles() {
  let entries;
  try {
    entries = fs.readdirSync(os.tmpdir(), { withFileTypes: true });
  } catch {
    return;
  }
  const hour = 3_600_000;
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.startsWith("flowcode-browser-")) continue;
    const full = path.join(os.tmpdir(), entry.name);
    try {
      if (Date.now() - fs.statSync(full).mtimeMs < hour) continue;
      fs.rmSync(full, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    } catch {
      // still in use; the next run looks again
    }
  }
}
