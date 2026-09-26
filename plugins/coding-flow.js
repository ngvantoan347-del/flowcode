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
import { Plugin } from "@opencode/plugin";

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

const RULES = [
  "CODING FLOW (internal discipline, never narrated): understand the real goal and the real code",
  "before touching anything; pick the approach that is already proven (standard library or a",
  "battle-tested library, the canonical algorithm) and name what you reused; implement it",
  "completely; prove it by running it, testing it, and trying to break it; deliver the finished",
  "result with the evidence that it works.",
  "",
  "Never announce phases, print a status line, fill a progress checklist, or narrate your",
  "itinerary. Never stop early - not for a step or budget limit, not for uncertainty, not to ask",
  "permission. Never end a turn with a question, a proposal, or a next-step list: finish the job,",
  "or name the single blocker that prevents it. A trivial question needing no tool call gets a",
  "direct answer.",
  "",
  "You cannot hand work back mid-task: the question tool is not available to you. When something",
  "is genuinely blocked, finish every part that is not blocked, then state that one blocker and",
  "what you did instead.",
  "",
  "Never claim a pass you did not run, and never present an inference as an observation. Spend",
  "tokens on evidence (real code, tests, negative cases, a broader check), never on repetition.",
].join("\n");

//#endregion

//#region measurement
function rotateIfOversized() {
  const stat = fs.statSync(METRICS, { throwIfNoEntry: false });
  if (stat && stat.size > METRICS_MAX_BYTES) fs.rmSync(METRICS, { force: true });
}

/** Anomalies only, so the log stays small enough to read and never becomes noise itself. */
function record(entry) {
  try {
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

export default Plugin.define({
  id: "coding-flow",
  setup(ctx) {
    stampLoad(ctx?.app?.version ?? "unknown");

    // Delivery + mechanism. Runs on every model request, compaction included: after context
    // compression the rules must still be present, and tokens are not the constraint.
    ctx.session.hook("context", (event) => {
      event.system.push({ type: "text", text: RULES });

      if (AUTONOMOUS_AGENTS.has(event.agent) && event.tools && QUESTION_TOOL in event.tools) {
        delete event.tools[QUESTION_TOOL];
        record({ kind: "question_tool_removed", agent: event.agent, sessionID: event.sessionID });
      }
    });

    // Measurement without ceremony: a tool that failed is a fact worth keeping, a tool that
    // succeeded is not worth a line.
    ctx.tool.hook("execute.after", (event) => {
      if (event.status !== "error") return;
      record({
        kind: "tool_error",
        tool: event.tool,
        agent: event.agent,
        sessionID: event.sessionID,
        detail: String(event.error?.message ?? event.error ?? "unknown").slice(0, 160),
      });
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
