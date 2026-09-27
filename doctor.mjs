/**
 * Install doctor: is this setup actually healthy?
 *
 * `npm test` is the assertion layer and `npm run eval` is the behaviour layer. This is the
 * screen a person runs when something feels off, so it answers with a verdict per item and a
 * fix per failure. It wraps the test suite rather than repeating its checks — one source of
 * truth, two audiences.
 *
 * Usage: node doctor.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const STATE = path.join(os.homedir(), ".local", "share", "opencode", "coding-flow");
const WINDOWS = process.platform === "win32";
const sh = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", timeout: 180_000, shell: WINDOWS, ...opts });

const checks = [];
const check = (name, ok, detail, fix) => checks.push({ name, ok, detail, fix });

// #region environment
const major = Number(process.versions.node.split(".")[0]);
check("node runtime", major >= 20, `node ${process.versions.node}`, "install Node 20 or newer");
//#endregion

// #region wiring, delegated to the test suite
// node.exe lives under "C:\Program Files", so it must be spawned directly: a shell would split
// the path on the space and the run would fail for a reason that has nothing to do with the setup.
const tests = sh(process.execPath, ["--test", "plugins/coding-flow.test.mjs"], { shell: false });
const failedAssertions = (tests.stdout ?? "")
  .split("\n")
  .filter((line) => line.includes("✖"))
  .slice(0, 2)
  .join(" | ");
const assertionCount = (tests.stdout ?? "").match(/tests\s+(\d+)/)?.[1];
check(
  "wiring (npm test)",
  tests.status === 0,
  tests.status === 0 ? `${assertionCount ?? "?"} assertions pass` : `exit ${tests.status}${failedAssertions ? `: ${failedAssertions.trim()}` : ""}`,
  "run `npm test` and read the failing assertion; it names the file and line",
);
//#endregion

// #region plugin liveness
const marker = path.join(STATE, "loaded");
if (!fs.existsSync(marker)) {
  check("plugin loaded at least once", false, "no load marker", "restart OpenCode, then run this again");
} else {
  let loadedAt = "unknown";
  let ageHours = Infinity;
  let info = {};
  try {
    info = JSON.parse(fs.readFileSync(marker, "utf8"));
    loadedAt = info.loadedAt ?? "unknown";
    ageHours = (Date.now() - Date.parse(loadedAt)) / 3_600_000;
  } catch {
    check("load marker readable", false, "marker is not valid JSON", `delete ${marker} and restart OpenCode`);
  }
  check(
    "plugin loaded at least once",
    true,
    `${loadedAt} (${Number.isFinite(ageHours) ? `${Math.round(ageHours)}h ago` : "just now"}), opencode ${info?.opencodeVersion ?? "?"}`,
  );
  if (Number.isFinite(ageHours) && ageHours > 168) {
    check("marker is fresh", false, `${Math.round(ageHours / 24)} days old`, "restart OpenCode so the plugin is loaded again");
  } else {
    check("marker is fresh", true, "loaded within the last week");
  }
}
//#endregion

// #region what the mechanism has actually been doing
const metrics = path.join(STATE, "metrics.jsonl");
const entries = fs.existsSync(metrics)
  ? fs.readFileSync(metrics, "utf8")
      .split("\n")
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return []; // a truncated last line is not worth failing over
        }
      })
  : [];

// The failure that is felt but never measured: a run that gets very long and changes nothing the
// user will see. The plugin samples tool calls against file changes, so the ratio is a number.
const latestPulse = new Map();
const day = Date.now() - 86_400_000;
const recent = [];
for (const entry of entries) {
  if (entry.kind === "pulse") latestPulse.set(entry.sessionID, entry);
  if (Date.parse(entry.t) > day) recent.push(entry.kind);
}

const heaviest = [...latestPulse.values()].sort((a, b) => b.calls - a.calls)[0];
if (!heaviest) {
  check("work against change", true, "no long run sampled yet, which is the healthy state");
} else {
  const ratio = Math.round((heaviest.writes / heaviest.calls) * 100);
  check(
    "work against change",
    heaviest.calls < 60 || ratio >= 20,
    `longest run: ${heaviest.calls} tool calls, ${heaviest.writes} of them changed a file (${ratio}%)`,
    heaviest.calls >= 60 && ratio < 20
      ? "most of that run only looked at things; if the work was finished earlier, the rules in plugins/coding-flow.js say to stop"
      : undefined,
  );
}

const tally = (kind) => recent.filter((k) => k === kind).length;
check(
  "anomalies (24h)",
  true,
  entries.length === 0
    ? "none recorded yet, which is the healthy state"
    : `${recent.length} events: question-tool removed ${tally("question_tool_removed")}, tool errors ${tally("tool_error")}`,
);
//#endregion

// #region version control
const head = sh("git", ["rev-parse", "HEAD"]).stdout.trim();
const dirty = sh("git", ["status", "--porcelain"]).stdout.trim();
check("working tree clean", dirty === "", dirty === "" ? "clean" : `${dirty.split("\n").length} uncommitted change(s)`, "commit or stash them");
const remote = sh("git", ["ls-remote", "origin", "refs/heads/main"]);
if (remote.status === 0) {
  const theirs = (remote.stdout ?? "").split(/\s+/)[0];
  check("in sync with origin", theirs === head, theirs === head ? head.slice(0, 7) : `local ${head.slice(0, 7)} vs origin ${(theirs ?? "?").slice(0, 7)}`, "git push");
} else {
  check("in sync with origin", true, "origin unreachable, skipped");
}
//#endregion

let failed = 0;
console.log("");
for (const { name, ok, detail, fix } of checks) {
  if (!ok) failed++;
  console.log(`  ${ok ? "✔" : "✖"} ${name.padEnd(28)} ${detail}`);
  if (!ok && fix) console.log(`      fix: ${fix}`);
}
console.log(`\n${checks.length - failed}/${checks.length} healthy\n`);
process.exit(failed === 0 ? 0 : 1);
