# flowcode

An OpenCode setup where the model does the work and stops when it is finished. Not a script of
phases, not a report format. Understand the real code, reuse what is already proven, change only
what a failing check points at, prove it, and answer with the evidence.

## How it is delivered

| Layer | File | Job |
| --- | --- | --- |
| Doctrine | `AGENTS.md` | Always loaded. Contract, autonomy, proven-first engineering, evidence. |
| Mode | `agents/max.md` | The default agent. Full access, one-shot, does not hand work back. |
| Delivery | `plugins/coding-flow.js` | Injects the non-negotiable part into every model request through the V2 `session.hook("context")` hook, so it survives compaction. |
| Mechanism | `plugins/coding-flow.js` | Removes the `question` tool from every `max` request. A model with no way to ask cannot stop to ask. |
| Measurement | `plugins/coding-flow.js` | Appends anomalies to a local JSONL log. Nothing is printed into the reply. |

Prose is followed only by habit. What prose cannot guarantee, the plugin carries: the flow is
re-sent on every request, and the one rule that matters most is enforced by the shape of the
request rather than by a sentence. One limit is structural — the V2 hook surface has no
assistant-message hook, so a question written in prose cannot be intercepted. The tool is gone; the
sentence is discouraged.

## Install

```sh
git clone https://github.com/ngvantoan347-del/flowcode.git ~/.config/opencode
```

That is the whole install. The plugin imports Node builtins only, so a bare clone already works and
`npm install` is optional, existing only to pull `@opencode/plugin` for editor type-checking. An
earlier version imported that package at runtime, and a clone without an install step failed with
`ERR_MODULE_NOT_FOUND` and lost the flow silently. `npm test` now pins that case.

No model is pinned. Pick one in the TUI, or pass it to a headless run:

```sh
opencode run --model <provider>/<model> "fix the failing test"
```

## Check it

```sh
npm run doctor   # is this setup healthy; each failure carries its fix
npm test         # 19 assertions, offline, under a second
npm run eval     # 5 behaviour fixtures, one real task each
```

`npm run eval` is the one that measures the claim rather than the wiring. Each fixture is a small
project with a real defect, handed to `opencode run` as a user would, then scored on: the run
finished without stopping to ask; no marker, no closing ritual, no mandated report; the answer
carried the evidence; and the fixture's own check passes afterwards. The last one cannot be faked.

```
coding-flow eval — 5 fixture(s)

  ✔ green-code-temptation   (tests 3, pass 3, fail 0)     ✔ one-shot  ✔ no-marker  ✔ evidence
  ✔ no-suite-exists         (tests 11, pass 11, fail 0)   ✔ one-shot  ✔ no-marker  ✔ evidence
  ✔ off-by-one-loop         (tests 3, pass 3, fail 0)     ✔ one-shot  ✔ no-marker  ✔ evidence
  ✔ sequential-awaits       (tests 1, pass 1, fail 0)     ✔ one-shot  ✔ no-marker  ✔ evidence
  ✔ silent-semantics        (tests 3, pass 3, fail 0)     ✔ one-shot  ✔ no-marker  ✔ evidence

5/5 fixtures scored clean
```

Test counts in that block are the model's own — it decides how many cases a fix deserves, so they
move between runs. What does not move is the verdict, and the check passing afterwards.

Scored on two free models: `longcat-2.5-preview-free` in 362s, `space-bunny-free` in 1333s. Both
5/5. The second is three times slower and no less correct.

The fixtures are chosen to catch, not to flatter. `green-code-temptation` has one broken function
and one green function that looks suspicious: rewriting the green one is a failure, and it happened
here once. `silent-semantics` has a green suite and a violated spec, so only reading the contract
gets you through. `no-suite-exists` has no tests, and `node --test` exits 0 when it finds none, so
the runner separately requires a test file afterwards — otherwise doing nothing scores clean.

```sh
node eval/run.mjs --only silent-semantics --show
node eval/run.mjs --model opencode/space-bunny-free
```

## What the answers look like

A fixed bug, unedited except for the quotes:

> **What changed:** `money.js:5` — added `.filter((t) => t.length > 0)` to the `parseTags` chain so
> empty/whitespace-only entries are dropped. Public API unchanged, no new dependencies.

The read-only `critic`, told which crash a file contained:

> No files were edited. The reported symptom (empty array crash) does not exist; the only real
> crash vector is a nullish `items` argument.

The prompt was wrong and the reviewer said so, with a reproduction, instead of agreeing.

## Limits

- **Compaction survival is argued, not measured.** The flow is re-injected on every request,
  observed 16 of 16 in a long run, and the injection comes from the plugin rather than the
  transcript. No test here triggered a real compaction: `keep.tokens` is the budget to keep, not
  the trigger, and the trigger needs the model's full context.
- **Free models, Windows, Node 24.** Nothing was run on a paid model, on Linux or macOS, or on
  anything older than Node 20.
- **`steps` stays at 1000.** Removing the field leaves the agent with no `steps` and no observable
  server default, so an explicit ceiling is a known value rather than a hoped-for one.
- **Any verification that depends on the environment needs `--standalone`.** `opencode run`
  otherwise connects to a background service started with its own environment, and a "clean-room"
  run quietly tests your own installed setup. It produced a green result here once.

## Posture

The committed config grants full access: nothing denied, nothing asked.

```sh
node safe-mode.mjs --status   # report
node safe-mode.mjs --on       # shell asks, irreversible denied
node safe-mode.mjs --off      # full access
```

The switch locates the permissions array with one rule, validates the result as JSONC, backs up,
and writes atomically. A posture round trip restores the file byte for byte, which is a test.

## Repository

`AGENTS.md` doctrine · `agents/` seven modes, `max` by default · `skills/proven-engineering` the
canonical pick per problem class · `eval/` the runner and its five fixtures · `LESSONS.md` rules
that survived a check. `service.json`, `node_modules/`, and `.rollback/` are local and ignored.
