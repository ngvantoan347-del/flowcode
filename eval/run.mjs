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
 *   check-fails   the check must fail now            (the defect is visible to the check)
 *   check-passes  the check must pass now            (the check is green, the contract is not met)
 *   no-suite      the project must have no test file (and must have one afterwards)
 *
 * `check.txt` holds a command line; `{root}` is replaced with this repository, so a check can
 * live here and run against the copied project. An exit code of 77 means the check itself could
 * not run — a missing capability, most often a browser — and is reported as a harness error, so
 * a machine that cannot render a page is told so rather than quietly passing it.
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

/** A fixture's check is a command line, so it is handed to the shell, which parses both a bare
 *  binary and a line with arguments. `{root}` points at this repository. */
function runCheck(commandLine, cwd) {
  const result = spawnSync(commandLine.replaceAll("{root}", ROOT), {
    cwd,
    encoding: "utf8",
    timeout: CHECK_TIMEOUT_MS,
    shell: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return { code: result.status ?? (result.error ? 1 : 0), out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

/** The check could not run at all: a capability is missing, not a defect. */
const CAPABILITY_ABSENT = 77;

const readIf = (file, fallback) => (fs.existsSync(file) ? fs.readFileSync(file, "utf8").trim() : fallback);

/** One line out of a check's own output, so the eval reports what the check actually said rather
 *  than a test-runner pattern that a page check will never match. */
const summarise = (out) => (out.match(/^(console|requests|viewport)\s+.*$/gm) ?? []).slice(0, 3).join(", ");

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
  const target = path.join(workdir, name);
  fs.cpSync(path.join(dir, "project"), target, { recursive: true });

  if (!task) {
    results.push({ name, invalid: "no task.txt" });
    continue;
  }

  const before = runCheck(check, target);
  if (before.code === CAPABILITY_ABSENT) {
    results.push({ name, errored: `the check could not run before the fixture: ${before.out.trim().split("\n").pop()}` });
    continue;
  }
  const beforeTests = testFiles(target);
  const preOk =
    precondition === "check-fails"
      ? before.code !== 0
      : precondition === "check-passes"
        ? before.code === 0
        : precondition === "no-suite"
          ? beforeTests === 0
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
  const after = runCheck(check, target);
  if (after.code === CAPABILITY_ABSENT) {
    results.push({ name, errored: `the check could not run after the fixture: ${after.out.trim().split("\n").pop()}` });
    continue;
  }
  const afterTests = testFiles(target);
  const verdicts = CRITERIA.map((criterion) => [criterion.name, criterion.test(agent.out, expect)]);
  // Derived from the same facts as the verdict, so the printed detail can never contradict it.
  const nothingPinned = precondition === "no-suite" && afterTests === 0;
  const stillFailing = after.code !== 0;
  const workDone = !stillFailing && !nothingPinned;
  const passed = workDone && verdicts.every(([, ok]) => ok);
  results.push({
    name,
    passed,
    verdicts,
    tests: afterTests,
    summary: (after.out.match(/(tests|pass|fail)\s+\d+/g) ?? []).slice(0, 3).join(", ") || summarise(after.out),
    tail: agent.out.trim().split("\n").slice(-16).join("\n"),
    detail: nothingPinned
      ? "the run added no test file, so nothing was pinned"
      : stillFailing
        ? `the check still fails after the run:\n${after.out.trim().split("\n").slice(0, 8).join("\n")}`
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

// Cleanup is best effort and never part of the verdict. A browser that has not finished exiting
// can still hold a handle on a file inside the workdir, and a clean eval must not be reported as
// a failure because a temp directory would not delete.
if (keep) {
  console.log(`workdir kept: ${workdir}`);
} else {
  try {
    fs.rmSync(workdir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (error) {
    console.log(`could not remove the workdir (${error.code ?? error.message}); delete it yourself: ${workdir}\n`);
  }
}

// An invalid fixture is a failure of the harness, not a pass. Neither is a run that never
// produced a reply: a crash must never read as a clean score.
process.exit(passed.length === scored.length && invalidFixtures.length === 0 && errored.length === 0 ? 0 : 1);
