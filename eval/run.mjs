/**
 * Behaviour eval for the coding flow.
 *
 * `npm test` proves the flow is wired. This proves it works: each fixture is a small project
 * with a real defect, run through `opencode run` exactly as a user would, then scored on the
 * behaviour the flow is supposed to produce. Nothing here grades prose — it checks whether the
 * work got done, once, without narrating, with the evidence attached.
 *
 * A fixture declares its own pre-state in `precondition.txt`, and the pre-state is verified
 * before the run. A broken fixture is reported as invalid, never as a pass:
 *
 *   check-fails   the check must fail now            (the defect is visible to the suite)
 *   check-passes  the check must pass now            (the suite is green, the spec is not met)
 *   no-suite      the project must have no test file (and must have one afterwards)
 *   no-check      there is nothing to run; the deliverable named in `deliverable.txt` must appear
 *
 * The `no-check` postcondition is what keeps a fixture honest for work that is not testable — a
 * page, a document, a config. "It exists and is real" is weak, and it is the only thing a
 * mechanical check can honestly ask.
 *
 * Usage: node eval/run.mjs [--only <fixture>] [--model <provider/model>] [--show] [--keep]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CRITERIA } from "./criteria.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_ROOT = path.join(ROOT, "eval", "fixtures");
const RUN_TIMEOUT_MS = 300_000;
const CHECK_TIMEOUT_MS = 60_000;
const WINDOWS = process.platform === "win32";
const OPENCODE = WINDOWS ? "opencode.cmd" : "opencode";

const argOf = (name) => {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
};
const only = argOf("--only");
const model = argOf("--model");
const keep = process.argv.includes("--keep");
const show = process.argv.includes("--show");

function run(command, args, cwd, timeout) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout, shell: WINDOWS, maxBuffer: 16 * 1024 * 1024 });
  return {
    code: result.status ?? (result.error ? 1 : 0),
    out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
    error: result.error?.message,
  };
}

const testFiles = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { recursive: true }).filter((f) => /\.(test|spec)\.[cm]?js$/.test(f)).length
    : 0;

const readIf = (file, fallback) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : fallback);

const names = fs
  .readdirSync(FIXTURE_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => !only || name === only);

if (names.length === 0) {
  console.error(only ? `no fixture named "${only}"` : `no fixtures in ${FIXTURE_ROOT}`);
  process.exit(1);
}

const workdir = fs.mkdtempSync(path.join(os.tmpdir(), "flowcode-eval-"));
const results = [];

for (const name of names) {
  const dir = path.join(FIXTURE_ROOT, name);
  const task = readIf(path.join(dir, "task.txt"), "");
  const expect = readIf(path.join(dir, "expect.txt"), ".");
  const check = readIf(path.join(dir, "check.txt"), "node --test");
  const precondition = readIf(path.join(dir, "precondition.txt"), "check-fails");
  const deliverable = readIf(path.join(dir, "deliverable.txt"), "");
  const target = path.join(workdir, name);
  fs.cpSync(path.join(dir, "project"), target, { recursive: true });

  if (!task) {
    results.push({ name, invalid: "no task.txt" });
    continue;
  }

  const usesCheck = precondition !== "no-check";
  const before = usesCheck ? run(check, [], target, CHECK_TIMEOUT_MS) : { code: 0, out: "" };
  const beforeTests = testFiles(target);
  const preOk =
    precondition === "check-fails"
      ? before.code !== 0
      : precondition === "check-passes"
        ? before.code === 0
        : precondition === "no-suite"
          ? beforeTests === 0
          : precondition === "no-check"
            ? Boolean(deliverable)
            : false;
  if (!preOk) {
    results.push({
      name,
      invalid: `precondition "${precondition}" not met (check exit ${before.code}, ${beforeTests} test file(s))`,
    });
    continue;
  }

  const agent = run(OPENCODE, ["run", ...(model ? ["--model", model] : []), "--auto", task], target);
  // A run that never happened is not a scored failure. Bad model ref, provider down, or a
  // network error must be reported as a harness error, or the benchmark ends up blaming the
  // flow for something the flow never saw.
  const notRun = agent.out.match(/(Model unavailable|model not found|No available (model|provider)|unauthorized|Unauthorized|ECONNREFUSED|fetch failed)/i);
  if (notRun) {
    results.push({ name, errored: `the run never started: ${notRun[0]} (is the model ref valid?)` });
    continue;
  }
  const after = usesCheck ? run(check, [], target, CHECK_TIMEOUT_MS) : { code: 0, out: "" };
  const afterTests = testFiles(target);
  const verdicts = CRITERIA.map((criterion) => [criterion.name, criterion.test(agent.out, expect)]);
  // Derived from the same facts as the verdict, so the printed detail can never contradict it.
  const delivered = precondition !== "no-check" || (() => {
    const file = path.join(target, deliverable);
    return fs.existsSync(file) && fs.statSync(file).size >= 200;
  })();
  const nothingPinned = precondition === "no-suite" && afterTests === 0;
  const stillFailing = usesCheck && after.code !== 0;
  const workDone = !stillFailing && !nothingPinned && delivered;
  const passed = workDone && verdicts.every(([, ok]) => ok);
  results.push({
    name,
    passed,
    verdicts,
    tests: afterTests,
    summary: (after.out.match(/(tests|pass|fail)\s+\d+/g) ?? []).slice(0, 3).join(", "),
    tail: agent.out.trim().split("\n").slice(-16).join("\n"),
    detail: !delivered
      ? `the deliverable ${deliverable || "(unnamed)"} was never created, or is too small to be the thing asked for`
      : nothingPinned
        ? "the run added no test file, so nothing was pinned"
        : stillFailing
          ? `the check still fails after the run:\n${after.out.trim().split("\n").slice(0, 6).join("\n")}`
          : undefined,
    error: agent.error,
  });
}

const invalidFixtures = results.filter((r) => r.invalid);
const errored = results.filter((r) => r.errored);
const scored = results.filter((r) => !r.invalid && !r.errored);
const passed = scored.filter((r) => r.passed);
// Read the model back out of the transcript rather than printing what was requested: a run that
// silently fell back to another model must not be scored under the name that was asked for.
const served = [...new Set(results.map((r) => r.reply?.match(/^>\s*\S+\s+·\s+(\S+)/m)?.[1]).filter(Boolean))];

console.log(`\ncoding-flow eval — ${scored.length} fixture(s)${model ? `, model ${model}` : ""}${served.length ? `, served by ${served.join(", ")}` : ""}\n`);
for (const result of results) {
  if (result.invalid || result.errored) {
    console.log(`  ✖ ${result.name}\n      ${result.invalid ? `invalid fixture: ${result.invalid}` : result.errored}`);
    continue;
  }
  const marks = result.verdicts.map(([criterion, ok]) => `${ok ? "✔" : "✖"} ${criterion}`).join("  ");
  const missed = [...result.verdicts.filter(([, ok]) => !ok).map(([c]) => c)];
  if (result.detail) missed.unshift("work-not-done");
  const suffix = result.passed ? `   (${result.summary || "no summary"})` : `   <- ${missed.join(", ")}`;
  console.log(`  ${result.passed ? "✔" : "✖"} ${result.name}${suffix}`);
  console.log(`      ${marks}`);
  if (result.detail) console.log(`      ${result.detail.replace(/\n/g, "\n      ")}`);
  // A failure with no evidence attached is not a usable result: the reply is the only place the
  // reason can be. `--show` prints it even on a pass, which is how you look at a benchmark run.
  if (!result.passed || show) {
    console.log("      reply tail:");
    console.log(result.tail.split("\n").map((line) => `        ${line}`).join("\n"));
  }
  if (result.error) console.log(`      opencode failed: ${result.error}`);
}

const notes = [
  invalidFixtures.length ? `${invalidFixtures.length} invalid fixture${invalidFixtures.length > 1 ? "s" : ""}` : "",
  errored.length ? `${errored.length} run${errored.length > 1 ? "s" : ""} never started` : "",
].filter(Boolean);

console.log(`\n${passed.length}/${scored.length} fixtures scored clean${notes.length ? `, ${notes.join(", ")}` : ""}\n`);

if (keep) {
  console.log(`workdir kept: ${workdir}`);
} else {
  fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

// An invalid fixture is a failure of the harness, not a pass. Neither is a run that never
// produced a reply: a crash must never read as a clean score.
process.exit(passed.length === scored.length && invalidFixtures.length === 0 && errored.length === 0 ? 0 : 1);
