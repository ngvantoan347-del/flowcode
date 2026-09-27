/**
 * Coding flow plugin — the flow as mechanism, not as prose.
 *
 * Three jobs, in order of how much they can actually guarantee:
 *
 * 1. DELIVERY. The flow is injected into EVERY model request through the V2 session
 *    "context" hook, so it survives compaction and cannot be lost to a forgotten
 *    instruction.
 * 2. MECHANISM. Prose is followed only by habit, so the rule that matters most — never
 *    hand work back — is enforced by removing the question tool from the request instead of
 *    asking the model to respect a sentence. The sanctioned alternative is in RULES: finish
 *    everything that is not blocked, then name the one blocker.
 * 3. MEASUREMENT. Anomalies are appended to a local JSONL log, never printed into the
 *    reply. A flow you cannot measure drifts; a flow you have to perform is a flow you will
 *    come to resent. Nothing here changes what the user sees.
 *
 * A load marker is stamped on setup so "did the plugin actually run?" is a fact.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * @opencode/plugin's define() is `plugin => plugin` — an identity helper that exists for
 * types. Importing it anyway made a fresh clone fail with ERR_MODULE_NOT_FOUND and cost the
 * whole flow, so the shape is declared locally and the package stays a dev-only type source.
 */
const define = (plugin) => plugin;

/** The config root: this plugin lives in <root>/plugins/. */
const CONFIG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

//#region state
const STATE_DIR = path.join(os.homedir(), ".local", "share", "opencode", "coding-flow");
const MARKER = path.join(STATE_DIR, "loaded");
const METRICS = path.join(STATE_DIR, "metrics.jsonl");
const METRICS_MAX_BYTES = 512 * 1024;

//#endregion

//#region policy
/** Agents that may not hand work back to the user mid-task. */
const AUTONOMOUS_AGENTS = new Set(["max"]);
/** The tool that would let the model stop and ask instead of deciding. */
const QUESTION_TOOL = "question";

/**
 * A capability the agent cannot be expected to use if it does not know it exists. Sent only when
 * the checker is really there, and kept to one line: it is worth far more than it costs, because
 * without it a page task has no check to reach for and the run resorts to looking at itself.
 */
const PAGE_CHECK = path.join(CONFIG_ROOT, "eval", "page-check.mjs");
const SERVE = path.join(CONFIG_ROOT, "eval", "serve.mjs");
const VERIFIER_NOTE =
  "Look a page up for real: `node eval/page-check.mjs <file>` verifies it in a browser (console errors, dead requests, phone-width overflow); `node eval/serve.mjs <dir>` serves it at an http://127.0.0.1 URL, because browser.tabs.open rejects file:// paths.";

const RULES = [  "CODING FLOW (internal discipline, never narrated): understand the real goal and the real code",
  "before touching anything; pick the approach that is already proven (standard library, a",
  "battle-tested library, the canonical algorithm) and name what you reused; implement it",
  "completely; change only what a failing check points at, because code whose test already passed",
  "is not broken; prove it with the cheapest check that can fail for the defect in question - a",
  "test that fails then passes, a command with an exit code, a page that must load clean - and",
  "deliver the finished result with the evidence.",
  "",
  "Work ends when that check passes: not before, or the work is unfinished; not after, or it is",
  "noise. A check that cannot fail for this defect is not a check. If the request states no",
  "acceptance criteria, derive the smallest set that satisfies it, meet it, and stop instead of",
  "inventing more. If the last action changed nothing the user will see, it was not work.",
  "",
  "Never announce phases, print a status line, fill a progress checklist, or narrate your",
  "itinerary. Never end a turn with a question, a proposal, or a next-step list: finish the job, or",
  "name the single blocker - the question tool is not in your request, so finish everything that is",
  "not blocked and state what stopped you. A trivial question needing no tool call gets a direct",
  "answer.",
  "",
  "Never claim a pass you did not run, and never present an inference as an observation. Spend",
  "tokens on the one check that can fail, never on repetition or on work already done.",
].join("\n");

/** The tools that change a file. Used only to measure the ratio of work to change, so a near-zero
 *  ratio across a long run is the signature of a loop that reads, checks and re-reads. */
const MUTATING_TOOLS = /^(write|edit|patch|multiedit|apply_patch|str_replace)/i;
/** How often a session's tally is written down. Every call would be noise; never sampling would
 *  hide the very run this exists to catch. */
const PULSE_EVERY = 20;

/** Per-session tally of tool calls against file changes. */
const pulse = new Map();

//#endregion

//#region measurement
function rotateIfOversized() {
  const stat = fs.statSync(METRICS, { throwIfNoEntry: false });
  if (stat && stat.size > METRICS_MAX_BYTES) fs.rmSync(METRICS, { force: true });
}

/** Anomalies only, so the log stays small enough to read and never becomes noise itself. */
function record(entry) {  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    rotateIfOversized();
    fs.appendFileSync(METRICS, `${JSON.stringify({ t: new Date().toISOString(), ...entry })}\n`, "utf8");
  } catch {
    // Measurement must never break a run.
  }
}

function stampLoad(opencodeVersion) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(
      MARKER,
      `${JSON.stringify(
        { loadedAt: new Date().toISOString(), opencodeVersion, autonomousAgents: [...AUTONOMOUS_AGENTS], rulesChars: RULES.length },
        null,
        2,
      )}\n`,
      "utf8",
    );
  } catch {
    // A missing marker must never stop the hooks from being registered.
  }
}

//#endregion

export default define({
  id: "coding-flow",
  setup(ctx) {
    stampLoad(ctx?.app?.version ?? "unknown");

    // Delivery + mechanism. Runs on every model request, compaction included: after context
    // compression the rules must still be present, and tokens are not the constraint.
    ctx.session.hook("context", (event) => {
      event.system.push({ type: "text", text: RULES });
      // Both commands are named in the note, so both must exist before it is sent.
      if (fs.existsSync(PAGE_CHECK) && fs.existsSync(SERVE)) {
        event.system.push({ type: "text", text: VERIFIER_NOTE });
      }
      if (AUTONOMOUS_AGENTS.has(event.agent) && event.tools && QUESTION_TOOL in event.tools) {
        delete event.tools[QUESTION_TOOL];
        record({ kind: "question_tool_removed", agent: event.agent, sessionID: event.sessionID });
      }
    });

    // Measurement without ceremony: a tool that failed is a fact worth keeping, a tool that
    // succeeded is not worth a line. The tally is the one that matters for drift, because it
    // separates work that changed something from work that only looked at something.
    // Wrapped whole, on purpose: this hook runs after every tool call in the session, so a throw
    // here takes out every tool the agent has, not just this measurement.
    ctx.tool.hook("execute.after", (event) => {
      try {
        const tally = pulse.get(event.sessionID) ?? { calls: 0, writes: 0 };
        tally.calls += 1;
        if (MUTATING_TOOLS.test(event.tool)) tally.writes += 1;
        pulse.set(event.sessionID, tally);
        if (tally.calls % PULSE_EVERY === 0) {
          record({ kind: "pulse", agent: event.agent, sessionID: event.sessionID, calls: tally.calls, writes: tally.writes });
        }
        if (event.status !== "error") return;
        record({
          kind: "tool_error",
          tool: event.tool,
          agent: event.agent,
          sessionID: event.sessionID,
          detail: String(event.error?.message ?? event.error ?? "unknown").slice(0, 160),
        });
      } catch {
        // Never propagate: an exception out of a tool hook breaks every tool in the session.
      }
    });

    return () => {
      try {
        fs.rmSync(MARKER, { force: true });
      } catch {
        // best effort
      }
    };
  },
});
