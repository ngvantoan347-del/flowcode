# flowcode

An OpenCode setup for an agent that works like an engineer: it produces code that runs, proves it
with a check that can fail, and stops when the check passes. Not a script of phases, not a report
format, not a demo. Understand the real code, reuse what is already proven, change only what a
failing check points at, and answer with the evidence.

## How it is delivered

| Layer | File | Job |
| --- | --- | --- |
| Doctrine | `AGENTS.md` | Always loaded. Contract, autonomy, proven-first engineering, evidence. |
| Mode | `agents/max.md` | The default agent. Full access, one-shot, does not hand work back. |
| Delivery | `plugins/coding-flow.js` | Injects the non-negotiable part into every model request through the V2 `session.hook("context")` hook, so it survives compaction. |
| Mechanism | `plugins/coding-flow.js` | Removes the `question` tool from every `max` request. A model with no way to ask cannot stop to ask. |
| Measurement | `plugins/coding-flow.js` | Appends anomalies to a local JSONL log, and samples tool calls against file changes. Nothing is printed into the reply. |

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
`npm install` is optional, existing only to pull `@opencode/plugin` for editor type-checking and
`puppeteer-core` for the browser check below. Without the latter, a fresh clone passes 27 of its 29
assertions, skips the two that need a browser, and `eval/page-check.mjs` exits 77 saying which
package is missing. An earlier version imported that package at runtime, and a clone without an
install step failed with `ERR_MODULE_NOT_FOUND` and lost the flow silently. `npm test` now pins that
case.

No model is pinned. Pick one in the TUI, or pass it to a headless run:

```sh
opencode run --model <provider>/<model> "fix the failing test"
```

## When to stop

A page was delivered, then the run kept refining it for a long time and the page never visibly
changed. That is the failure this section exists to prevent, and it has three parts.

**A check has to be able to fail.** Prove the work with the cheapest check that can fail for the
defect in question: a test that fails then passes, a command with an exit code, a page that must
load clean, a number for a performance claim. Taste is not a check. A visual loop has no exit
condition, so never let one stand in for a check.

**The stop condition is named.** Work ends when that check passes. Not before, or the work is
unfinished; not after, or it is noise. When the request states no acceptance criteria, derive the
smallest set that satisfies it, meet it, and stop — do not invent criteria to justify another pass.

**The last action has to have changed something.** If it did not, it was not work. Re-reading,
re-running a passing check, and re-reading again are how a run turns into a loop that produces no
pixels.

The doctrine fixes the behaviour. The measurement is separate, so the failure is a number rather
than a feeling: the plugin samples tool calls against file changes every twenty calls, and
`npm run doctor` prints the ratio for the longest run it has seen. A long run at a low ratio is a
run that was looking, not working.

## Self-sufficiency

The sandbox supplies the ground and none of the outcome. It does not hand over a prepared
environment, a generous context, or a system that keeps saying what the next step is — the work
stands on the agent's own judgement, and the capability gets created when the task needs one that
does not exist yet.

That is not a licence to do less or to do it badly. Each part is built properly first, then taken
apart: keep the depth, the precision, the behaviour and the detail someone actually feels; remove
what is redundant, inert, or held by momentum. Quality is never cut to feel lighter.

Every thought has a reason to exist, every action creates value, every capability earns its place.
Not everything needs to grow. Not every problem needs another tool. Not every process needs to be
stretched. And when the result is good, stop — not because tokens ran out.

## Seeing a page, not just its markup

Some work has no failing test. A landing page is the obvious case: there is no suite to run, so
"prove it" has nothing to point at, and a model left with only that either skips verification or
falls into a loop of looking at itself. That is a blind spot in the environment, and the fix is to
notice it and go get the capability rather than to soften the requirement.

```sh
node eval/page-check.mjs index.html --width 360
```

It drives a real browser — the Chrome or Edge already installed, not a 300 MB download — and fails
on anything a text diff cannot see:

```
rendered   file:///.../index.html
title      Cà Phê Lý Thường Kiệt
text       312 characters
console    0 error(s)
requests   0 failed, 0 uncaught
viewport   360px, no overflow
screenshot C:\Users\...\Temp\page-check-index-html.360.png
PASS
```

Console errors, uncaught exceptions, dead requests, and horizontal overflow on a phone viewport all
fail it. So does a missing file, and it names the file rather than blaming the driver. A page that
never finishes loading is a defect, not an infrastructure error.

Two details that are part of the design rather than polish. It uses a browser profile of its own,
because a leftover profile carries a lock that makes the next launch fail with "the browser is
already running" — a flake that only appears after a few runs. And it terminates the process it
started: a verifier that leaks browsers is not a verifier. Nothing here is special-cased for pages
either; the same script checks any URL.

The capability is advertised to the agent in every request when the file is present, because a
capability the agent cannot know about is one it cannot use. A check that cannot run says so with
exit code 77 — a machine with no browser is told that, rather than quietly passing the one fixture
that needs one.

The eval's `check.txt` is a command line, so any fixture can use this or any other tool:
`node "{root}/eval/page-check.mjs" index.html --width 360`, with `{root}` pointing at this
repository.

## Opening a local file in a tab

`browser.tabs.open` accepts only http(s) and `about:blank`, so a file on disk cannot be opened in a
tab. An agent that reaches for a `file://` URL spends a turn learning that from an error, so the
capability is here instead of the rule:

```sh
node eval/serve.mjs <dir>          # prints the URL to open
node eval/serve.mjs <dir> --port 0 # let the OS pick, which is safer on a busy machine
```

```
serving C:\Users\ADMIN\Desktop\lap
  http://127.0.0.1:8137/
  a local file cannot be opened in a tab with a file:// URL; use this one
```

The listener binds `127.0.0.1` only — a source tree is not something to expose to a network — and
every resolved path is checked against the root, so `/../secret.txt` and four other spellings of
the same walk all return 404. A directory with no `index.html` serves its one page, or lists what is
there, because a 404 at the root reads as a broken server. Three assertions cover it, and they need
no browser.

It runs until interrupted, so start it in the background. A server started as an ordinary
foreground call dies with that call's timeout, and the tab outlives nothing.

The last hop is the honest gap: whether a tab actually renders the served page was not verified
here, because no desktop browser is connected to the session that wrote this. That is the same
condition that produced the original error, and it is the part `page-check.mjs` exists to cover
headlessly.

## Check it

```sh
npm run doctor   # is this setup healthy; each failure carries its fix
npm test         # 29 assertions; the three browser ones skip cleanly with no browser
npm run eval     # 5 behaviour fixtures, one real task each
```

`npm run eval` is the one that measures the claim rather than the wiring. Each fixture is a small
project with a real defect, handed to `opencode run` as a user would, then scored on: the run
finished without stopping to ask; no marker, no closing ritual, no mandated report; the answer
carried the evidence; the reply did not announce a further pass; and the fixture's own check — or,
for work with no command to run, its deliverable — is there afterwards. The last one cannot be faked.

```
coding-flow eval — 6 fixture(s)

  ✔ green-code-temptation   (tests 3, pass 3, fail 0)     ✔ one-shot  ✔ no-marker  ✔ evidence  ✔ no-further-work
  ✔ no-suite-exists         (tests 10, pass 10, fail 0)   ✔ one-shot  ✔ no-marker  ✔ evidence  ✔ no-further-work
  ✔ off-by-one-loop         (tests 3, pass 3, fail 0)     ✔ one-shot  ✔ no-marker  ✔ evidence  ✔ no-further-work
  ✔ page-in-one-pass        (console 0 error(s), requests 0 failed, 0 uncaught, viewport 360px, no overflow)
                              ✔ one-shot  ✔ no-marker  ✔ evidence  ✔ no-further-work
  ✔ sequential-awaits       (tests 1, pass 1, fail 0)     ✔ one-shot  ✔ no-marker  ✔ evidence  ✔ no-further-work
  ✔ silent-semantics        (tests 4, pass 4, fail 0)     ✔ one-shot  ✔ no-marker  ✔ evidence  ✔ no-further-work

6/6 fixtures scored clean
```

Test counts are the model's own — it decides how many cases a fix deserves, so they move between
runs. The verdict does not. The page fixture's numbers come from the browser check, not the model.
Scored on two free models, both clean: `longcat-2.5-preview-free` in 362s for the first five
fixtures, `space-bunny-free` at 1333s. The second is slower and no less correct. A full run of all
six takes ten to twenty minutes on a free model, most of it waiting on the provider.

The fixtures are chosen to catch, not to flatter. `green-code-temptation` has one broken function
and one green function that looks suspicious: rewriting the green one is a failure, and it happened
here once. `silent-semantics` has a green suite and a violated spec, so only reading the contract
gets you through. `no-suite-exists` has no tests, and `node --test` exits 0 when it finds none, so
the runner separately requires a test file afterwards — otherwise doing nothing scores clean.
`page-in-one-pass` has nothing to run at all: it builds a landing page from a notes file, which is
the task class where a check degenerates into taste.

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

- **The reported loop is measured, not reproduced.** The landing-page run that triggered this
  needed a browser tab, and a headless run never entered the loop: the same task measured 11
  requests and 21s idle before the change, 12 and 35s after. The rules name the stop condition and
  the ratio makes a future loop visible, but no run here has looped to prove the fix.
- **The agent was told about the browser check and did not reach for it.** In one run it verified
  its page with a `node -e` grep for tags instead. The harness verifies rendered output either way;
  that the model chooses a cheaper check of its own is unproven either way, and forcing the choice
  through the prompt was not worth doing.
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
canonical pick per problem class · `eval/` the runner, its six fixtures, and the browser check
`page-check.mjs` · `LESSONS.md` rules that survived a check. `service.json`, `node_modules/`, and
`.rollback/` are local and ignored.
