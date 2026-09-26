/**
 * Coding flow plugin — structural delivery of the agent flow.
 *
 * The flow lives in prose (agents/max.md and AGENTS.md), which a weak model follows only by
 * habit. This plugin injects the non-negotiable part into EVERY model request through the
 * V2 session "context" hook, so the flow cannot be lost to a forgotten instruction. It injects
 * the flow, never a report format: no phases to announce, no marker to print.
 *
 * It also stamps a load marker, so "did the plugin actually run?" is a fact rather than a hope.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Plugin } from "@opencode/plugin";

const MARKER = path.join(os.homedir(), ".local", "share", "opencode", "coding-flow.loaded");

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
  "Never claim a pass you did not run, and never present an inference as an observation. Spend",
  "tokens on evidence (real code, tests, negative cases, a broader check), never on repetition.",
].join("\n");

export default Plugin.define({
  id: "coding-flow",
  setup(ctx) {
    try {
      fs.mkdirSync(path.dirname(MARKER), { recursive: true });
      fs.writeFileSync(
        MARKER,
        `${JSON.stringify({ loadedAt: new Date().toISOString(), opencodeVersion: ctx?.app?.version ?? "unknown", rules: RULES.length }, null, 2)}\n`,
        "utf8",
      );
    } catch {
      // A missing marker must never stop the hook from being registered.
    }

    // Injected into every model request, compaction included: after context
    // compression the rules must still be present, and tokens are not the constraint.
    ctx.session.hook("context", (event) => {
      event.system.push({ type: "text", text: RULES });
    });

    return () => {
      try { fs.rmSync(MARKER, { force: true }); } catch { /* best effort */ }
    };
  },
});
