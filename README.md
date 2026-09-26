# flowcode

An OpenCode agent setup that makes the model behave like a senior engineer who finishes the job.

The flow is a **discipline, not a script**: understand the real goal and the real code, pick the
approach that is already proven, implement it completely, prove it by running and testing and
trying to break it, then deliver the result with the evidence. No narrated phases, no status
lines, no progress checklists, no "next steps" handoff at the end of a turn.

## Install

The repository *is* the `~/.config/opencode` layout, so it clones straight into place.

```sh
git clone https://github.com/ngvantoan347-del/flowcode.git ~/.config/opencode
```

That is the whole install. There is no dependency to fetch and no build step: the plugin imports
only Node builtins, so a bare clone is already a working install. `npm install` is optional and
exists only to pull `@opencode/plugin` for editor type-checking.

Restart OpenCode. No model is pinned in the config on purpose — pick the model in the TUI and
switch per session.

On Windows the config root is `%USERPROFILE%\.config\opencode`; the layout is identical.

## Running on the free tier

Nothing here requires a paid provider. The config pins no model, so the TUI decides; a headless
run takes one explicitly:

```sh
opencode run --model <provider>/<model> "fix the failing test in this repo"
```

Two things keep long free-tier runs intact. The flow is re-injected on every model request, so
it survives the context compaction a small-context model triggers. And the plugin has no runtime
dependency, so a skipped install step cannot silently cost a user the whole flow — that failure
mode was real: an earlier version imported `@opencode/plugin` at runtime and a fresh clone died
with `ERR_MODULE_NOT_FOUND`, taking the flow with it. `npm test` now pins that case.

## What is enforced, and where

| Layer | File | What it does |
| --- | --- | --- |
| Doctrine | `AGENTS.md` | Loaded into every session by OpenCode. Contract, autonomy, proven-first engineering, evidence rules. |
| Primary mode | `agents/max.md` | The default agent. Full access, high step ceiling, never stops to ask. |
| Delivery | `plugins/coding-flow.js` | Injects the non-negotiable part of the flow into **every** model request through the V2 `session.hook("context")` hook, so it survives compaction. |
| Mechanism | `plugins/coding-flow.js` | Removes the `question` tool from the request for `max`, so "never hand work back" is a property of the request, not a sentence the model is asked to respect. |
| Measurement | `plugins/coding-flow.js` | Appends anomalies — a removed question tool, a failed tool call — to a local JSONL log. Nothing is ever printed into the reply. |

Prose alone is followed only by habit; the plugin is what makes the flow survive a weak model and
a context compaction. What prose cannot guarantee at all, the plugin enforces structurally: a
model with no way to ask cannot stop to ask. One limit is worth stating plainly — the V2 hook
surface has no assistant-message hook, so a question written in prose cannot be intercepted. The
tool is gone; the sentence is discouraged, not blocked.

State lives in `~/.local/share/opencode/coding-flow/`: `loaded` is stamped on setup, so "did the
plugin actually run?" is a fact rather than a hope, and `metrics.jsonl` is capped at 512 KB.

## Modes

`max` (default) is the autonomous engineer. The rest are specialists, usable as subagents or
directly: `architect` (read-only design), `critic` (adversarial review), `implementer` (one
verified slice at a time), `scout` (fast read-only investigation), `verifier` (independent test
and evidence), `evolver` (read-only, proposes doctrine changes — never applies them).

The specialists are injected the same flow as `max` and were measured for it: asked to review a
file that did not contain the bug it was told about, `critic` ran a reproduction, reported the
real defect, and edited nothing. The full-access rules in `agents/max.md` are not a licence to
edit during a read-only role, and the eval is where that stays honest.

## Skills

- `proven-engineering` — the canonical pick per problem class: BM25, trigram/Jaro-Winkler, Myers
  diff, exponential backoff with jitter, BLAKE3/SHA-256/HMAC, bounded worker pool, seeded PRNG,
  float tolerance, property-based testing.
- `verification` — the narrowest falsifying check, then broaden, then a negative case.
- `owl-reasoning` — a prediction and a falsifying check for every step, for ambiguous or risky work.
- `self-evolution` — bounded, evidence-backed doctrine changes; never model weights.

## Verify the install

```sh
npm run doctor                            # is this setup healthy, and if not, what fixes it
npm test                                  # 15 assertions, no install needed, no model calls
npm run eval                              # 5 behaviour fixtures, one real task each
```

`npm run doctor` is the one to run first: it checks the runtime, the wiring (by running the test
suite), whether the plugin has actually loaded and how fresh that is, what the mechanism has been
doing in the last 24 hours, and whether the checkout matches origin. Each failure carries its fix.

`npm test` is the guard against the regressions that actually happened here: a config that points
at a plugin file which no longer exists, a rules string that drifts back into demanding a printed
marker, a step ceiling low enough to end a long run mid-task, a `max` request that still carries
the `question` tool, a clone that cannot load the plugin without an install step, and an eval
fixture that would quietly score as a pass.

## The eval: check the claim, do not take it

`npm run eval` is the part that matters. Wiring proves the plugin is connected; only running real
tasks proves the flow works. Each fixture is a small project with a genuine defect, handed to
`opencode run` exactly as a user would, then scored on three behaviours — the run completed
without stopping to ask, it did not narrate or print a table, and its answer carried the evidence
— plus the only criterion that cannot be faked: the fixture's own check has to pass afterwards.

```
coding-flow eval — 5 fixture(s)

  ✔ green-code-temptation   (tests 3, pass 3, fail 0)
      ✔ one-shot  ✔ no-marker  ✔ evidence
  ✔ no-suite-exists   (tests 13, pass 13, fail 0)
      ✔ one-shot  ✔ no-marker  ✔ evidence
  ✔ off-by-one-loop   (tests 3, pass 3, fail 0)
      ✔ one-shot  ✔ no-marker  ✔ evidence
  ✔ sequential-awaits   (tests 1, pass 1, fail 0)
      ✔ one-shot  ✔ no-marker  ✔ evidence
  ✔ silent-semantics   (tests 3, pass 3, fail 0)
      ✔ one-shot  ✔ no-marker  ✔ evidence

5/5 fixtures scored clean
```

The fixtures are chosen to punish the failure modes that matter, not to flatter the setup:

- `off-by-one-loop` — a loop bound bug, the ordinary case.
- `green-code-temptation` — one broken function and one green function that *looks* suspicious.
  Rewriting the green one is the failure this catches; it happened here, and the fix was a rule.
- `silent-semantics` — the suite is green and the spec is still violated, so the only way through
  is to read the contract and write the test that was missing.
- `sequential-awaits` — a test that fails only if the fetches are not truly concurrent.
- `no-suite-exists` — no tests at all. `node --test` exits 0 when it finds nothing, so the runner
  separately requires that a test file exists afterwards; otherwise doing nothing scores clean.

Each fixture declares its pre-state in `precondition.txt` and the runner verifies it before the
run, so a fixture that stops being a real defect is reported as invalid rather than as a pass.
A run that never started — bad model ref, provider down — is reported as a harness error and is
never scored as a flow failure. On failure the runner prints the reply, because a verdict without
its evidence is not usable.

```sh
npm run eval                                        # default model
node eval/run.mjs --model opencode/space-bunny-free  # point it at another one
node eval/run.mjs --only silent-semantics --show     # one fixture, reply shown even on a pass
```

The same five fixtures were run against a second free model, `space-bunny-free`, and it scored
5/5 as well — 1333s instead of 362s, since that model is much slower, with the work finished and
the discipline intact on every fixture.

## What the output actually looks like

From a run of this flow, unedited except for the quotes:

> **What changed:** `money.js:5` — added `.filter((t) => t.length > 0)` to the `parseTags` chain so
> empty/whitespace-only entries are dropped. Public API unchanged, no new dependencies.

From the read-only `critic` agent, asked to review a file and told the crash it contained:

> No files were edited. The reported symptom (empty array crash) does not exist; the only real
> crash vector is a nullish `items` argument.

That second one is the behaviour worth wanting: the prompt was wrong, and the reviewer said so
with a reproduction instead of agreeing.

## Limits, stated rather than implied

Everything above was measured on Windows, Node 24, and two free models (`longcat-2.5-preview-free`
at 362s for the suite, `space-bunny-free` at 1333s). The boundaries, so nobody has to guess where
the evidence stops:

- **Compaction survival is argued, not measured.** The flow is re-injected on *every* model
  request — observed 16 out of 16 in a long run, 10 out of 10 in another — and the injection comes
  from the plugin rather than the transcript, so a summary cannot erase it. But no test here
  triggered a real compaction: `compaction.keep.tokens` is the budget to keep, not the trigger, and
  the trigger needs the model's full context. On a large-context model that is expensive to force,
  so the claim is left at what was observed.
- **No paid model, no POSIX run.** Every path goes through `path.join` and `os.homedir()`, and the
  CLI shim is selected per platform, but nothing here has been executed on Linux or macOS, and the
  eval has only been pointed at free models.
- **`steps` stays at 1000.** Removing the field leaves the agent config with no `steps` at all, and
  no server-side default was observable, so an explicit ceiling is a value that is known rather
  than one that is hoped for. If a task ever stops citing a step limit, raise the number.
- **Any verification that depends on the environment needs `--standalone`.** `opencode run` connects
  to a background service that was started with its own environment, so `OPENCODE_CONFIG_DIR` does
  not switch which config or plugins load. Without `--standalone`, a "clean-room" run quietly
  tests your own installed setup. That mistake produced a green result here once, and the probe
  that exposed it is recorded in `LESSONS.md`.

## Permissions posture

The committed config grants full access: nothing is denied, nothing asks. Switch to the
restricted posture and back with:

```sh
node safe-mode.mjs --status   # show current posture
node safe-mode.mjs --on       # restricted: backups the config first
node safe-mode.mjs --off      # full access again
```

`safe-mode.mjs` validates the JSONC after every edit and writes atomically, so a failed switch
leaves the previous config intact.

## Not in this repository

`service.json` (local service credential), `node_modules/`, and `.rollback/` (local snapshots of
earlier versions) are gitignored. `LESSONS.md` is included: it is the evidence-backed rule store
the flow reads and appends to.
