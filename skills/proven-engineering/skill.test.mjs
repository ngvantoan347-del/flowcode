/**
 * What the skill promises, pinned.
 *
 * A skill is prose, and prose cannot fail a test — so it drifts. That has happened here: the table
 * recommended `rg`, which resolves on PATH here and cannot execute, so the canonical pick for
 * searching a repository was a command that had never run. These assertions are what stop that
 * class of rot: every tool the skill names is executed, the skill's table and the probe's
 * expectations are the same content in two shapes, and every file the skill points at exists.
 *
 * The negative control below runs the same table against a fixture whose expectations are wrong,
 * so "the check passes" is never confused with "the check cannot fail".
 *
 * Run: node --test skills/proven-engineering/skill.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, test } from "node:test";

import { CLAIMS, PROBES, brokenClaims, checkClaims, drift, probeAll } from "./scripts/probe.mjs";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILL_MD = path.join(SKILL_DIR, "SKILL.md");
const skill = fs.readFileSync(SKILL_MD, "utf8");
const body = skill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");

/** The frontmatter as an object, read the way a loader reads it: a key, a colon, the rest. */
function frontmatter() {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(skill)?.[1];
  assert.ok(block, "SKILL.md opens with a frontmatter block, or nothing advertises the skill");
  const fields = {};
  for (const line of block.split(/\r?\n/)) {
    const entry = /^([A-Za-z0-9_/-]+):\s*(.*)$/.exec(line);
    if (entry) fields[entry[1]] = entry[2].trim();
  }
  return fields;
}

describe("the skill is discoverable", () => {
  test("the frontmatter names it and says when to reach for it", () => {
    const fields = frontmatter();
    assert.match(fields.name ?? "", /\S/, "a display name");
    const description = fields.description ?? "";
    assert.ok(description.length > 80, `the description is ${description.length} characters; it must state what the skill does and when it applies, since it is the only part loaded before the body`);
    // The description is the whole triggering surface: the model sees name + description and decides
    // whether to load the body. A list of topics with no trigger conditions under-triggers.
    assert.match(description, /when|whenever|before|instead of|rather than/i, "the description names the situation, not just the topic");
  });

  test("the directory name is the ID a caller has to pass, in portable form", () => {
    const id = path.basename(SKILL_DIR);
    assert.match(id, /^[a-z0-9]+(-[a-z0-9]+)*$/, `"${id}" is the path-derived ID; it is case-sensitive and used verbatim by the skill tool`);
  });
});

describe("the table of picks is true, not aspirational", () => {
  test("every tool the skill names is executed, and the verdict is the one published", () => {
    const observations = probeAll();
    assert.equal(observations.length, PROBES.length);
    for (const { tool, actual, why } of drift(observations)) {
      assert.fail(
        `${tool} is ${actual} here and the skill's table does not say so${why ? `: ${why}` : ""}. Run scripts/probe.mjs, then fix the table in SKILL.md or the probe here`,
      );
    }
  });

  test("the negative control: a table with one wrong verdict is rejected", () => {
    // Without this, "no drift" only means the two lists were written from the same source. The real
    // observations are held and fed a table that lies about one tool; the comparison has to notice.
    const observations = probeAll();
    const node = observations.find((o) => o.tool === "node");
    assert.equal(node.actual, "present", "the control needs a tool that really is here");

    const lying = PROBES.map((row) => (row.tool === "node" ? { ...row, expect: "absent" } : row));
    const caught = drift(observations, lying);
    assert.deepEqual(
      caught.map((c) => c.tool),
      ["node"],
      "a single wrong verdict is named, and nothing else is reported",
    );
  });

  test("every documented claim is executed, and holds", () => {
    // The skill's non-obvious rows — the ASCII word boundary, the fold order, the stateful `/g`
    // predicate — are language facts, so nothing about the host keeps them honest. A rule stated
    // once and never run is a rule that can be inverted by an edit that still reads correctly.
    const observations = checkClaims();
    assert.ok(observations.length >= 8, `only ${observations.length} claim(s) are executed`);
    for (const { claim, actual, expected } of brokenClaims(observations)) {
      assert.fail(`"${claim}" no longer holds: it produced ${JSON.stringify(actual)}, the skill says ${JSON.stringify(expected)}`);
    }
  });

  test("the claims checker can fail: one inverted expectation is named", () => {
    const observations = checkClaims();
    const target = observations[0].claim;
    const lying = CLAIMS.map((row) => (row.claim === target ? { ...row, expected: Symbol("wrong") } : row));
    assert.deepEqual(
      brokenClaims(observations, lying).map((b) => b.claim),
      [target],
      "exactly the inverted claim is reported, and nothing else",
    );
  });

  test("every row of the platform table is backed by a probe", () => {
    // The rot this catches is concrete: the table once recommended `rg` for repository search,
    // which resolves on PATH here and cannot execute. A row nobody ran is only a claim.
    const table = /\| Class \| Use here \| Status \| Instead of \|([\s\S]*?)\n\n/.exec(body);
    assert.ok(table, "the platform table is present; a skill that names tools with no status column cannot be checked at all");
    const probed = PROBES.map((row) => row.tool);
    const rows = table[1]
      .split("\n")
      .filter((line) => line.trim().startsWith("|") && !line.includes("---"));
    assert.ok(rows.length >= 5, `the platform table has ${rows.length} row(s)`);
    for (const row of rows) {
      assert.ok(
        probed.some((tool) => row.includes(tool)),
        `no probe covers this row, so nothing in it is verified: ${row.trim()}`,
      );
    }
  });

  test("a tool the skill calls absent is not recommended anywhere in the body", () => {
    // The rot this file exists to catch: a table row that says a tool is unusable while the prose
    // hands it to the reader as the canonical pick. The two are checked against each other.
    const absent = PROBES.filter((row) => row.expect === "absent").map((row) => row.args[0]);
    assert.ok(absent.length > 0, "the check has subjects; a table with no absent tool cannot catch this");
    for (const tool of absent) {
      const recommendation = new RegExp(`(use|run|reach for|prefer)\\s+(the\\s+)?\`?${tool}\\b`, "i");
      assert.doesNotMatch(
        body,
        recommendation,
        `the body recommends \`${tool}\`, which scripts/probe.mjs reports as absent on this machine`,
      );
    }
  });
});

describe("the skill points at files that exist", () => {
  test("every relative path the body names is on disk", () => {
    const referenced = new Set(
      [...body.matchAll(/`((?:scripts|references)\/[A-Za-z0-9._/-]+)`/g)].map((m) => m[1]),
    );
    assert.ok(referenced.size >= 2, `the body names ${referenced.size} bundled file(s); a skill that references nothing carries its depth inline`);
    for (const rel of referenced) {
      assert.ok(fs.existsSync(path.join(SKILL_DIR, rel)), `${rel} is referenced by SKILL.md but missing on disk`);
    }
  });

  test("the body stays inside the budget that keeps it loadable", () => {
    // ~500 lines is the documented ceiling for a skill body: past it, loading the skill costs more
    // context than the task, and the detail belongs in a reference file instead.
    const lines = body.split(/\r?\n/).length;
    assert.ok(lines <= 500, `the body is ${lines} lines; past ~500 the detail belongs in references/`);
  });
});
