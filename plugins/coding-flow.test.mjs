/**
 * What the flow depends on, pinned.
 *
 * These assertions exist because each one corresponds to a failure that actually happened:
 * a plugin path that pointed at a renamed file, a marker the model printed instead of
 * working, a step ceiling low enough to stop a run mid-task. Run: npm test
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { after, before, describe, test } from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SANDBOX_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "coding-flow-test-"));
const STATE_DIR = path.join(SANDBOX_HOME, ".local", "share", "opencode", "coding-flow");

/** os.homedir() reads USERPROFILE on Windows and HOME elsewhere, so both are redirected
 *  before the plugin is imported: its state paths are computed at module load. */
before(() => {
  process.env.USERPROFILE = SANDBOX_HOME;
  process.env.HOME = SANDBOX_HOME;
});

function fakeCtx() {
  const registered = { session: {}, tool: {}, permission: {} };
  const recorder = (bag) => (name, callback) => {
    bag[name] = callback;
    return Promise.resolve({ dispose() {} });
  };
  return {
    app: { version: "9.9.9-test" },
    session: { hook: recorder(registered.session) },
    tool: { hook: recorder(registered.tool) },
    permission: { hook: recorder(registered.permission) },
    registered,
  };
}

const readMetrics = () =>
  fs.existsSync(path.join(STATE_DIR, "metrics.jsonl"))
    ? fs.readFileSync(path.join(STATE_DIR, "metrics.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];

describe("coding flow: delivery", () => {
  test("the flow reaches every model request, including after compaction", async () => {
    const plugin = (await import("./coding-flow.js")).default;
    const ctx = fakeCtx();
    await plugin.setup(ctx);

    const event = { agent: "max", system: [], tools: { read: { description: "read" } } };
    await ctx.registered.session.context(event);

    const injected = event.system.filter((part) => typeof part.text === "string" && part.text.includes("CODING FLOW"));
    assert.equal(injected.length, 1, "exactly one flow injection per request");
  });

  test("the flow states no report format: no marker, no table, no closing ritual", async () => {
    const plugin = (await import("./coding-flow.js")).default;
    const ctx = fakeCtx();
    await plugin.setup(ctx);

    const event = { agent: "max", system: [], tools: {} };
    await ctx.registered.session.context(event);
    const rules = event.system.map((p) => p.text).join("\n");

    assert.doesNotMatch(rules, /path:\s*SENSE/i, "no path marker to print");
    assert.doesNotMatch(rules, /End every reply/i, "no closing ritual");
    assert.doesNotMatch(rules, /\|\s*-{2,}\s*\|/, "no required table");
    assert.match(rules, /Never announce phases/, "the ban on narrated phases stays");
    assert.match(
      rules,
      /only what a failing check points at/i,
      "the ban on editing code whose test already passed stays",
    );
  });
});

describe("coding flow: mechanism", () => {
  test("max cannot hand work back, because the question tool is not in the request", async () => {
    const plugin = (await import("./coding-flow.js")).default;
    const ctx = fakeCtx();
    await plugin.setup(ctx);

    const event = { agent: "max", system: [], tools: { question: { description: "ask" }, read: { description: "read" } } };
    await ctx.registered.session.context(event);

    assert.equal("question" in event.tools, false, "question removed for max");
    assert.equal("read" in event.tools, true, "real work tools untouched");
  });

  test("other agents keep the question tool", async () => {
    const plugin = (await import("./coding-flow.js")).default;
    const ctx = fakeCtx();
    await plugin.setup(ctx);

    const event = { agent: "build", system: [], tools: { question: { description: "ask" } } };
    await ctx.registered.session.context(event);

    assert.equal("question" in event.tools, true, "only the autonomous agent is constrained");
  });
});

describe("coding flow: measurement", () => {
  test("the load marker records the real OpenCode version", async () => {
    const plugin = (await import("./coding-flow.js")).default;
    const ctx = fakeCtx();
    const cleanup = await plugin.setup(ctx);

    const marker = JSON.parse(fs.readFileSync(path.join(STATE_DIR, "loaded"), "utf8"));
    assert.equal(marker.opencodeVersion, "9.9.9-test");
    assert.deepEqual(marker.autonomousAgents, ["max"]);

    await cleanup();
    assert.equal(fs.existsSync(path.join(STATE_DIR, "loaded")), false, "cleanup removes the marker");
  });

  test("a removed question tool is measured instead of printed", async () => {
    const plugin = (await import("./coding-flow.js")).default;
    const ctx = fakeCtx();
    await plugin.setup(ctx);

    await ctx.registered.session.context({ agent: "max", system: [], tools: { question: {} } });

    const entries = readMetrics();
    assert.equal(entries.at(-1).kind, "question_tool_removed");
    assert.equal(entries.at(-1).agent, "max");
  });

  test("tool failures are recorded and successes are not", async () => {
    const plugin = (await import("./coding-flow.js")).default;
    const ctx = fakeCtx();
    await plugin.setup(ctx);

    const before = readMetrics().length;
    await ctx.registered.tool["execute.after"]({ tool: "read", agent: "max", sessionID: "s", status: "completed", result: {} });
    assert.equal(readMetrics().length, before, "a success is not worth a line");

    await ctx.registered.tool["execute.after"]({ tool: "shell", agent: "max", sessionID: "s", status: "error", error: { message: "exit 1" } });
    const entries = readMetrics();
    assert.equal(entries.length, before + 1);
    assert.equal(entries.at(-1).kind, "tool_error");
    assert.equal(entries.at(-1).tool, "shell");
  });
});

describe("coding flow: the config it depends on", () => {
  const configText = fs.readFileSync(path.join(ROOT, "opencode.jsonc"), "utf8");

  test("a fresh clone loads the plugin with nothing installed", async () => {
    // The community case, proved at runtime: the plugin file is imported from a directory with
    // no node_modules anywhere above it, which is what a clone without `npm install` looks like.
    // This failed with ERR_MODULE_NOT_FOUND while the plugin imported @opencode/plugin.
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "coding-flow-bare-"));
    try {
      fs.copyFileSync(path.join(ROOT, "plugins", "coding-flow.js"), path.join(bare, "coding-flow.js"));
      const module = await import(pathToFileURL(path.join(bare, "coding-flow.js")).href);
      assert.equal(module.default.id, "coding-flow");
      assert.equal(typeof module.default.setup, "function");
    } finally {
      fs.rmSync(bare, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  });

  test("no shipped file needs an install step", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const runtime = Object.keys(pkg.dependencies ?? {});
    assert.deepEqual(runtime, [], `runtime dependencies force an install: ${runtime.join(", ")}`);

    for (const rel of ["plugins/coding-flow.js", "safe-mode.mjs"]) {
      const source = fs.readFileSync(path.join(ROOT, rel), "utf8");
      for (const [, specifier] of source.matchAll(/from\s+"([^"]+)"/g)) {
        assert.ok(
          specifier.startsWith("node:") || specifier.startsWith("."),
          `${rel} imports ${specifier}, which a bare clone cannot resolve`,
        );
      }
    }
  });

  test("every plugin path in the config exists on disk", () => {
    // A renamed plugin file that the config still points at fails at load, not at test time.
    const referenced = [...configText.matchAll(/"\.\/(plugins\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(referenced.length > 0, "the config references at least one plugin");
    for (const rel of referenced) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `${rel} is referenced by opencode.jsonc but missing on disk`);
    }
  });

  test("the configured plugin actually loads as a module", async () => {
    // What OpenCode does at startup, without spawning a 120s CLI: resolve the path the config
    // names, import it, and require the shape the host expects.
    const referenced = [...configText.matchAll(/"\.\/(plugins\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(referenced.length > 0, "the config references at least one plugin");

    for (const rel of referenced) {
      const module = await import(pathToFileURL(path.join(ROOT, rel)).href);
      assert.equal(typeof module.default?.setup, "function", `${rel} exports a plugin with setup()`);
      assert.equal(typeof module.default?.id, "string", `${rel} exports a plugin id`);
    }
  });

  test("max has a step ceiling that cannot stop a real run", () => {
    const agent = fs.readFileSync(path.join(ROOT, "agents", "max.md"), "utf8");
    const steps = Number(/^steps:\s*(\d+)/m.exec(agent)?.[1]);
    assert.ok(Number.isFinite(steps), "max declares a step ceiling");
    assert.ok(steps >= 500, `a ceiling of ${steps} is low enough to end a long run mid-task`);
  });

  test("no live prompt requires the model to print a marker or a table", () => {
    const live = ["AGENTS.md", ...fs.readdirSync(path.join(ROOT, "agents")).map((f) => path.join("agents", f))];
    for (const rel of live) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.doesNotMatch(text, /path:\s*SENSE/i, `${rel} still asks for a path marker`);
      assert.doesNotMatch(text, /End every reply/i, `${rel} still asks for a closing ritual`);
    }
  });
});

// Windows can hold a transient lock on a freshly written file; retry, then never fail the
// suite on cleanup.
describe("coding flow: the eval harness", () => {
  const fixtures = path.join(ROOT, "eval", "fixtures");
  const PRECONDITIONS = ["check-fails", "check-passes", "no-suite"];

  test("every fixture declares a task, an expectation, a project, and a known precondition", () => {
    const names = fs
      .readdirSync(fixtures, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    assert.ok(names.length >= 3, "an eval with almost no fixtures proves nothing");

    for (const name of names) {
      const dir = path.join(fixtures, name);
      assert.ok(fs.readdirSync(dir).includes("project"), `${name} has a project directory`);
      for (const file of ["task.txt", "expect.txt", "precondition.txt"]) {
        assert.ok(fs.existsSync(path.join(dir, file)), `${name} is missing ${file}`);
      }
      assert.ok(fs.readFileSync(path.join(dir, "task.txt"), "utf8").trim().length > 0, `${name} has a real task`);
      const precondition = fs.readFileSync(path.join(dir, "precondition.txt"), "utf8").trim();
      assert.ok(
        PRECONDITIONS.includes(precondition),
        `${name} declares an unknown precondition "${precondition}"; the runner would score it invalid`,
      );
    }
  });

  test("the runner scores from the same facts it prints", () => {
    // A benchmark whose detail line can contradict its own verdict is worse than no benchmark,
    // so the pass condition and the message are derived from one place in the source.
    const source = fs.readFileSync(path.join(ROOT, "eval", "run.mjs"), "utf8");
    assert.match(source, /const workDone = !stillFailing && !nothingPinned;/, "one definition of done");
    assert.doesNotMatch(
      source,
      /workDone = after\.code === 0 &&/,
      "the old duplicated condition, which printed a false alarm on a passing run",
    );
  });
});

after(() => {
  try {
    fs.rmSync(SANDBOX_HOME, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // the sandbox is under the OS temp dir and will be reclaimed there
  }
});
