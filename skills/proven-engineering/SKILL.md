---
name: Proven Engineering
description: Choose the canonical algorithm, library, or platform primitive instead of a plausible variant, and prove the choice is real before building on it. Use this whenever you are about to hand-roll something that already exists — hashing, ID generation, diffing or merging, fuzzy matching, ranking, caching, retries, concurrency, scheduling, randomness, float and money arithmetic, Unicode or regex boundaries, JSON/YAML/markup parsing, validation, test strength, parser structure, numeric stability, or durable file writes — and also when picking a dependency, when a library turns out to be the defect, or when you are tempted to write "just a small helper" for one of those.
---

# Proven engineering

Most engineering time is not spent inventing algorithms. It is spent choosing one, and the
choosing is where the defects come from: a plausible variant that is subtly wrong, a library that
was written for a different problem, or a "simplification" that quietly drops an invariant. This
skill exists to make the choice deliberate and checkable.

The standard is one sentence: **reuse the canonical option, cite it, and prove it is real.** A
choice you cannot name a source for is a guess wearing a library's name.

## The procedure

1. **Name the problem class** before naming a tool. "Search the repo" is a class; `grep` is a
   guess. The tables below are organised by class, so start there.
2. **Take the top option that fits.** Standard library first — it is already installed, already
   audited, and already in everyone's cache. Then a mature library with a maintenance record.
   Only then an algorithm you can cite, which you implement yourself.
3. **Verify before you build on it.** Run the library's own test, or the failing input it is
   meant to fix, against the real case. A library is not an oracle: a popular slugifier on this
   machine's history silently deleted every Vietnamese character, and a Jaro-Winkler
   implementation with a default prefix weight of 0 will not behave like the one in the paper.
   The cheapest check is the input that is already broken — if the library does not fix that,
   it is not the library for this.
4. **Write down the one-line reason if you deviate.** "The canonical option is too heavy here
   because X" is a record the next reader can audit. Without the line, a decision and an
   oversight look identical forever.
5. **Pin the version in the lockfile, not in prose.** A named library at an unpinned version is a
   different library next month.

Steps 3 and 4 are the ones that get skipped, and they are the ones that matter. Step 3 is what
turns a claim into evidence; step 4 is what stops the knowledge from dying with the person who
had it.

## Verify the platform before you trust it

A tool that resolves on `PATH` is not a tool that runs. On this machine `rg` resolves to a WinGet
link that has no executable behind it: it looks installed, so it gets planned around, and it fails
at the first real call. `scripts/probe.mjs` runs every tool this skill names, and it also executes
the documented claims below — the ASCII word boundary, the fold order, the stateful `/g` predicate
— because a rule written down and never run is a rule an edit can invert while every example still
reads correctly. Both are pinned by `skill.test.mjs`.

```sh
node skills/proven-engineering/scripts/probe.mjs
```

| Class | Use here | Status | Instead of |
| --- | --- | --- | --- |
| Search a repo | `git grep` | present | a hand-rolled walker |
| Three-way merge | `git merge-file` | present | `diff3` (absent here) |
| Parse structured text | `JSON.parse`, `node:` parsers | present | regex over nested grammar |
| Unit tests | `node --test` | present | a hand-rolled runner |
| JSON on a CLI | `node -e` | present | `jq` (absent here) |
| Helper scripting | `python` | present | shell string surgery |
| Fast text search | `rg` | **absent** — the `PATH` entry is a dead shim | `git grep` |

Two of those rows are absences and they are the point. A skill that only lists what exists is
useless on the machine you are standing on; the canonical pick is `git grep` here, and the reason
is one probe away rather than one failed command away.

## The map

Ordered by how often the choice is actually made. Each row names the canonical pick, the class of
thing that is genuinely wrong, and where the depth is.

### Strings, text, and search

| Problem | Canonical pick | The variant that looks right |
| --- | --- | --- |
| Substring or line search | the platform's own: `git grep`, `String.prototype.includes`, `RegExp` | a hand-rolled scanner that misses Unicode folds |
| Fuzzy match, short names | Jaro-Winkler with a *stated* prefix weight; trigram index for dedupe at scale | Jaro-Winkler with defaults, which is a different metric |
| Ranking documents | BM25 or TF-IDF, parameters cited | counting substring hits |
| Tokenising words | `Intl.Segmenter` | `split(/\s+/)`, which is wrong for scripts without spaces |
| Grapheme clusters | `Intl.Segmenter` with `granularity: "grapheme"` | counting UTF-16 code units, which splits emoji and flags |
| Case-insensitive match, non-ASCII | case-fold *after* decomposition: `NFKD → strip \p{M} → NFC → toLowerCase` | folding first, which is not idempotent for caseless characters |
| Word boundaries in non-ASCII text | `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` with the `u` flag | `\b`, which is ASCII-only in JavaScript and has dead branches |
| Diffing text | Myers; `git diff` in practice | line-by-line equality |
| Three-way merge | `git merge-file`, or `diff3 -m` where it exists | overwriting one side |

`references/text-and-unicode.md` has the evidence for the three non-obvious rows, including a
Unicode case that changes a slug's URL on the second pass.

### Data, storage, and durability

| Problem | Canonical pick | The variant that looks right |
| --- | --- | --- |
| JSON, YAML, markup | the real parser | regex over a nested grammar |
| Validation at a boundary | JSON Schema, `zod`, or the language's own types | hand-rolled checks that miss inherited keys |
| Hashing for identity | `crypto.createHash("sha256")` | a hand-rolled hash |
| Hashing for speed | BLAKE3, or the platform's fast digest | SHA-256 in a hot loop that did not need it |
| Passwords | `scrypt`, `argon2`, or `pbkdf2` from the crypto library | a fast hash, which is the defect |
| Token comparison | `crypto.timingSafeEqual`, on equal-length buffers | `===` on a hex digest |
| Random IDs | `crypto.randomUUID()`, `crypto.getRandomValues` | `Math.random()` |
| Reproducible randomness | a seeded PRNG, seeded from the test name | reseeding per call |
| Caching | TTL plus LRU, with negative caching | an unbounded `Map` |
| Durable writes | append-only journal, or write-temp-then-rename | in-place mutation |
| Structured data on disk | `JSON` with a version field, or `node:sqlite` | a bespoke binary format |

Two of these have a trap that costs an afternoon each and is worth stating here rather than
learning again. `timingSafeEqual` throws `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` on buffers of
different lengths, so hash to a fixed width before comparing. And `fs.renameSync` over an existing
file replaces it atomically, which is what makes write-temp-then-rename the durable pattern — on
this platform a directory `fsync` throws `EPERM`, so the crash-safety story has to lean on the
rename, not on the flush.

### Concurrency, time, and resources

| Problem | Canonical pick | The variant that looks right |
| --- | --- |
| Fan-out | a bounded pool, `Promise.allSettled` for partial failure | unbounded `Promise.all` over a user-sized list |
| Independent async work | launch every promise, then await once | `await` inside a `for` loop, which serialises it |
| Retries | exponential backoff with full jitter, and a cap | fixed sleep, or retries on a non-idempotent write |
| Scheduling | a priority queue with aging, so nothing starves | an ad-hoc sort, re-run per tick |
| Debounce and throttle | `AbortController` plus a timestamp | a `setTimeout` per keystroke, never cleared |
| Cancellation | `AbortSignal`, `AbortSignal.timeout` | a boolean flag checked in three places |
| Cloning | `structuredClone` | `JSON.parse(JSON.stringify(x))` |
| Deep equality | the runtime's own, with the tolerance you need | `===` on floats |
| Locks across processes | the OS primitive: file lock, or the database | an in-process `Map` of flags |
| Clocks | `Date.now()` for wall time, `performance.now()` for durations | one clock for both, so a clock change becomes a phantom timeout |

### Numbers and correctness

| Problem | Canonical pick | The variant that looks right |
| --- | --- | --- |
| Float comparison | tolerance scaled to the magnitude | `==`, or a fixed epsilon on values of any size |
| Money | integers of minor units, or a decimal type | binary floating point |
| Accumulating many floats | compensated summation | naive accumulation, which drifts |
| Exactness that matters | integers, or a rational/decimal type | a float that "looks right" in the fixture |
| Index to a grid | `row = floor(i / COLS)`, `col = i % COLS` | dividing by `ROWS` |
| Test strength | property-based tests; mutation testing for the tests | example-only tests |
| Test doubles | a double audited for fidelity, then proved capable of failing | a stub that answers less than the real thing |
| Structure of parsers and state machines | table-driven, or a generator | nested `if`/`else` |

A duplicated constant is a latent bug: it was true here of a rig height written into a clearance
rule that was then never revisited, and every path validated against a body 0.19 units too short
passed. Derive the constant from the thing it describes and let the rule consume it.

### Security

Reach for the library every time, and keep the choices boring: TLS from the runtime, a
constant-time compare for secrets, a KDF with a real work factor for passwords, a parameterised
query for anything user-supplied, and a path check on every resolved path you serve. The details
and the failure shapes are in `references/security.md`.

## What "cite it" means

A citation is a name and a version: the language or runtime documentation, the algorithm's paper,
the library's own tests and changelog. A blog post that names none of those is not a source, and
neither is your memory of what a function was called last year.

When the light option is genuinely right, the record is one line, in the code, next to the
decision: what the canonical option would have cost, and why that was not worth paying. It is
worth writing even when it feels obvious, because the next reader cannot tell an oversight from a
decision.

## The habits that are not obvious

- **Bound everything**: input size, fan-out, recursion depth, retry count, memory. An unbounded
  loop is a latent outage, and an unbounded `await Promise.all` over a user-supplied list is the
  same bug wearing different clothes.
- **Copy the reference implementation's *structure*, not its code.** The structure carries the
  invariants; the code carries the author's assumptions about their own data.
- **A green suite is evidence about the inputs it exercised.** If the spec lives outside the code,
  enumerate its clauses and run each one. A suite that never covered the branch that was inverted
  will happily report a pass.
- **Verify the harness before you believe it.** When a measurement disagrees with the theory,
  check the measurement's own inputs first. A harness that has not checked itself produces
  confident, specific, wrong answers — the most expensive kind.

## Files

- `scripts/probe.mjs` — runs every tool named above and every claim the references assert, and
  prints the verdict. Run it after installing a tool, after a runtime upgrade, or when a command
  fails in a way its error does not explain. Exit 1 means the skill and the machine disagree.
- `references/text-and-unicode.md` — the boundary, case-folding, and normalisation rules with
  the reproductions behind them.
- `references/security.md` — the boring choices, and the failure shape of each.
- `references/verification.md` — how to check that a library does what its README claims, and
  how to test the test.
