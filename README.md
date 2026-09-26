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
cd ~/.config/opencode
npm install          # installs @opencode/plugin, the plugin's only dependency
```

Restart OpenCode. No model is pinned in the config on purpose — pick the model in the TUI and
switch per session.

On Windows the config root is `%USERPROFILE%\.config\opencode`; the layout is identical.

## What is enforced, and where

| Layer | File | What it does |
| --- | --- | --- |
| Doctrine | `AGENTS.md` | Loaded into every session by OpenCode. Contract, autonomy, proven-first engineering, evidence rules. |
| Primary mode | `agents/max.md` | The default agent. Full access, no step ceiling in practice, never stops to ask. |
| Delivery | `plugins/coding-flow.js` | Injects the non-negotiable part of the flow into **every** model request through the V2 `session.hook("context")` hook, so it survives compaction. |

Prose alone is followed only by habit; the plugin is what makes the flow survive a weak model and
a context compaction. It also stamps `~/.local/share/opencode/coding-flow.loaded` on setup, so
"did the plugin actually run?" is a fact rather than a hope.

## Modes

`max` (default) is the autonomous engineer. The rest are specialists, usable as subagents or
directly: `architect` (read-only design), `critic` (adversarial review), `implementer` (one
verified slice at a time), `scout` (fast read-only investigation), `verifier` (independent test
and evidence), `evolver` (read-only, proposes doctrine changes — never applies them).

## Skills

- `proven-engineering` — the canonical pick per problem class: BM25, trigram/Jaro-Winkler, Myers
  diff, exponential backoff with jitter, BLAKE3/SHA-256/HMAC, bounded worker pool, seeded PRNG,
  float tolerance, property-based testing.
- `verification` — the narrowest falsifying check, then broaden, then a negative case.
- `owl-reasoning` — a prediction and a falsifying check for every step, for ambiguous or risky work.
- `self-evolution` — bounded, evidence-backed doctrine changes; never model weights.

## Verify the install

```sh
node --check plugins/coding-flow.js      # plugin parses
opencode debug agents                    # "max" is registered
opencode run --auto "fix the failing test in this repo"
cat ~/.local/share/opencode/coding-flow.loaded   # plugin actually loaded
```

A healthy run fixes the work, reports the check with its output, tries a negative case, and does
not narrate its phases or ask what to do next.

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
