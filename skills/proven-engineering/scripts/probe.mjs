/**
 * Probe the tools this skill recommends, so "it works on my machine" is a fact and not a claim.
 *
 * A canonical pick is only worth its name if it actually runs. This script asks each recommended
 * tool the smallest question that answers that — does it run? — and compares the answer with the
 * verdict the skill publishes. The skill's table and `PROBES` are the same content in two shapes,
 * and `skill.test.mjs` fails if they ever disagree, so neither can rot silently.
 *
 * Absence is a finding, not a failure: the skill names what to use instead, and printing the
 * absence is more useful than letting the reader discover it. A name that resolves on PATH but
 * cannot execute is reported separately, because that one looks installed and gets planned around.
 *
 * Run: node skills/proven-engineering/scripts/probe.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash, hash, timingSafeEqual } from "node:crypto";

/** Fixtures the probes need, written fresh per run so nothing depends on a real repository. */
const FIXTURES = {
  "grep-me.txt": "probe\n",
  "ours.txt": "head\nours\n",
  "base.txt": "head\n",
  "theirs.txt": "theirs\nhead\n",
  "suite.test.mjs": "import { test } from 'node:test';\ntest('the probe suite runs', () => {});\n",
};

/**
 * One row per tool the skill names. `args` is the whole command line, program included, with
 * `{sandbox}` replaced by a temporary directory holding the fixtures above. `expect` is the verdict
 * the skill publishes: `absent` must fail to spawn, which is how a dead PATH shim and a tool that
 * was never installed get told apart — they need different words in the skill.
 */
export const PROBES = [
  { tool: "node", args: ["node", "--version"], expect: "present" },
  { tool: "node --test", args: ["node", "--test", "{sandbox}/suite.test.mjs"], expect: "present" },
  { tool: "git", args: ["git", "--version"], expect: "present" },
  {
    tool: "git grep",
    args: ["git", "grep", "--no-index", "-c", "probe", "{sandbox}/grep-me.txt"],
    expect: "present",
  },
  {
    tool: "git merge-file",
    args: [
      "git",
      "merge-file",
      "-p",
      "{sandbox}/ours.txt",
      "{sandbox}/base.txt",
      "{sandbox}/theirs.txt",
    ],
    expect: "present",
  },
  { tool: "python", args: ["python", "--version"], expect: "present" },
  { tool: "rg", args: ["rg", "--version"], expect: "absent" },
  { tool: "diff3", args: ["diff3", "--version"], expect: "absent" },
  { tool: "jq", args: ["jq", "--version"], expect: "absent" },
];

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "proven-engineering-"));
  for (const [name, body] of Object.entries(FIXTURES)) {
    fs.writeFileSync(path.join(dir, name), body, "utf8");
  }
  return dir;
}

/** `shell: false` on purpose: through a PowerShell wrapper a missing tool raises a non-terminating
 *  error and the exit status reported is the previous command's, which reads as a pass. */
function run(args, dir) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: dir,
    encoding: "utf8",
    timeout: 30_000,
    shell: false,
  });
  return {
    // A spawn that never produced a process never ran, which is what an absent tool looks like
    // to the person who tried it.
    ran: !result.error && result.status !== null,
    code: result.status,
    detail: String(result.error?.code ?? result.stdout ?? result.stderr ?? "")
      .trim()
      .split("\n")[0],
  };
}

/** Does the name resolve on PATH at all? Separate from "did it run", because the two failures need
 *  different words: a tool that is not installed is absent, and a tool whose PATH entry is a dead
 *  shim is worse, because it looks installed. `rg` here is exactly that case. */
function onPath(program) {
  const found = spawnSync("where.exe", [program], { encoding: "utf8", timeout: 15_000, shell: true });
  return found.status === 0 ? (found.stdout ?? "").split(/\r?\n/).filter(Boolean)[0] ?? "" : "";
}

/** One observation per probe, with no opinion about whether it is good news. */
export function probeAll() {
  const dir = sandbox();
  try {
    return PROBES.map(({ tool, args }) => {
      const { ran, code, detail } = run(
        args.map((arg) => arg.replaceAll("{sandbox}", dir)),
        dir,
      );
      return {
        tool,
        program: args[0],
        actual: ran ? "present" : "absent",
        code,
        detail,
        resolves: ran ? "" : onPath(args[0]),
      };
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/**
 * Compare observations with the published table. Separate from `probeAll` so a test can hold the
 * real observations and feed them a deliberately wrong table — the only way to show that "no
 * drift" is a result rather than a shape that can only ever come out true.
 */
export function drift(observations, table = PROBES) {
  const byTool = new Map(table.map((row) => [row.tool, row]));
  return observations.flatMap((observation) => {
    const row = byTool.get(observation.tool);
    if (!row) return [{ ...observation, expect: undefined, matches: false, why: "no expectation published" }];
    if (row.expect === observation.actual) return [];
    return [
      {
        ...observation,
        expect: row.expect,
        matches: false,
        why: observation.resolves
          ? `resolves to ${observation.resolves}, which does not execute`
          : observation.detail,
      },
    ];
  });
}

/**
 * The language-level claims this skill makes, as assertions.
 *
 * These are specification facts, not machine facts, so no host can change them — which is exactly
 * why they rot quietly: a future edit inverts one and every example in the prose still reads
 * correctly. Running them costs microseconds and turns a documented rule into a held rule.
 */
export const CLAIMS = [
  {
    claim: "`\\b` is ASCII-only, so an alternative ending in a non-ASCII letter can never match",
    code: () => /\bhậu quả\b/iu.test("hậu quả"),
    expected: false,
  },
  {
    claim: "the same boundary is a false positive inside a longer word",
    code: () => /\blưu\b/iu.test("lưuý"),
    expected: true,
  },
  {
    claim: "the property escape sees the letter the word boundary cannot",
    code: () => /\p{L}/u.test("ư"),
    expected: true,
  },
  {
    claim: "the Unicode lookaround is the boundary that is actually correct",
    code: () => /(?<![\p{L}\p{N}])lưu(?![\p{L}\p{N}])/iu.test("lưuý"),
    expected: false,
  },
  {
    claim: "folding first leaves a capital behind: U+1D4D6 is caseless and decomposes to G",
    code: () => "\u{1D4D6}".toLowerCase().normalize("NFKD").replace(/\p{M}/gu, ""),
    expected: "G",
  },
  {
    claim: "decomposing, stripping, recomposing, then folding is idempotent",
    code: () => {
      const fold = (s) => s.normalize("NFKD").replace(/\p{M}/gu, "").normalize("NFC").toLowerCase();
      return fold(fold("Hậu Quả")) === fold("Hậu Quả");
    },
    expected: true,
  },
  {
    claim: "a shared /g regex is not a predicate: the same call alternates",
    code: () => {
      const g = /lưu/giu;
      return `${g.test("lưu lại")},${g.test("lưu lại")}`;
    },
    expected: "true,false",
  },
  {
    claim: "a grapheme cluster is not a UTF-16 code-unit count",
    code: () => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment("🏳️‍🌈")].length,
    expected: 1,
  },
  {
    claim: "timingSafeEqual refuses buffers of different lengths instead of leaking the difference",
    code: () => {
      try {
        timingSafeEqual(Buffer.alloc(32), Buffer.alloc(16));
        return "no throw";
      } catch (error) {
        return error.code;
      }
    },
    expected: "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH",
  },
  {
    claim: "a hash is deterministic, so hashing both sides to a fixed width before comparing is sound",
    code: () => hash("sha256", "a") === createHash("sha256").update("a").digest("hex"),
    expected: true,
  },
];

/** Run every claim and report what it produced, with no opinion about whether that is correct. */
export function checkClaims() {
  return CLAIMS.map(({ claim, code }) => {
    let actual;
    try {
      actual = code();
    } catch (error) {
      actual = `threw ${error.code ?? error.name}`;
    }
    return { claim, actual };
  });
}

/**
 * Compare observations with the published expectations. Kept separate from `checkClaims` for the
 * same reason `drift` is: a test can hold the real observations and feed them a wrong table, which
 * is the only way to show that "every claim holds" is a result rather than a shape that can only
 * ever come out true.
 */
export function brokenClaims(observations, table = CLAIMS) {
  const byClaim = new Map(table.map((row) => [row.claim, row]));
  return observations.flatMap((observation) => {
    const row = byClaim.get(observation.claim);
    if (!row) return [{ ...observation, expected: undefined, holds: false }];
    return row.expected === observation.actual ? [] : [{ ...observation, expected: row.expected, holds: false }];
  });
}

// `pathToFileURL`, not a hand-built `file://${argv[1]}`: the loader reports three slashes for a
// Windows path, so the string form never matches and the script exits 0 having printed nothing.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const observations = probeAll();
  const claims = checkClaims();
  const drifted = drift(observations);
  const width = Math.max(...observations.map((o) => o.tool.length));
  for (const observation of observations) {
    const published = PROBES.find((row) => row.tool === observation.tool)?.expect;
    console.log(
      `  ${drifted.some((d) => d.tool === observation.tool) ? "DRIFT" : "OK  "} ${observation.tool.padEnd(width)}  ${observation.actual} (skill says ${published})`,
    );
  }
  const notes = drifted.map((d) => `${d.tool}: ${d.why}`);
  console.log(
    drifted.length === 0
      ? `\n${observations.length}/${observations.length} tools match the skill's table`
      : `\n${drifted.length} tool(s) disagree with the skill's table\n${notes.map((n) => `  ${n}`).join("\n")}`,
  );

  const broken = brokenClaims(claims);
  for (const { claim, actual } of claims) {
    const holds = !broken.some((b) => b.claim === claim);
    console.log(`  ${holds ? "OK  " : "DRIFT"} ${claim}${holds ? "" : `  (got ${JSON.stringify(actual)})`}`);
  }
  console.log(
    broken.length === 0
      ? `\n${claims.length}/${claims.length} documented claims still hold\n`
      : `\n${broken.length} claim(s) no longer hold: fix the skill, not the assertion\n`,
  );
  process.exit(drifted.length === 0 && broken.length === 0 ? 0 : 1);
}
