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
      ✔ one-shot  ✔ no-ceremony  ✔ evidence
  ✔ no-suite-exists   (tests 13, pass 13, fail 0)
      ✔ one-shot  ✔ no-ceremony  ✔ evidence
  ✔ off-by-one-loop   (tests 3, pass 3, fail 0)
      ✔ one-shot  ✔ no-ceremony  ✔ evidence
  ✔ sequential-awaits   (tests 1, pass 1, fail 0)
      ✔ one-shot  ✔ no-ceremony  ✔ evidence
  ✔ silent-semantics   (tests 3, pass 3, fail 0)
      ✔ one-shot  ✔ no-ceremony  ✔ evidence

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
Budget about a minute per fixture on a free model; `node eval/run.mjs --only <name>` runs one.

## What the output actually looks like

From a run of this flow, unedited except for the quotes:

> **What changed:** `money.js:5` — added `.filter((t) => t.length > 0)` to the `parseTags` chain so
> empty/whitespace-only entries are dropped. Public API unchanged, no new dependencies.

From the read-only `critic` agent, asked to review a file and told the crash it contained:

> No files were edited. The reported symptom (empty array crash) does not exist; the only real
> crash vector is a nullish `items` argument.

That second one is the behaviour worth wanting: the prompt was wrong, and the reviewer said so
with a reproduction instead of agreeing.

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
