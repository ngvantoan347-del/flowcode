---
name: Proven Engineering
description: Use battle-tested algorithms, libraries, and platform primitives instead of hand-rolled variants; the canonical pick per problem class.
---

# Proven engineering

Rule: **do not invent what already exists.** Standard library, then a mature battle-tested
library, then a well-understood algorithm you can cite. Hand-rolling is a last resort, and it
needs a reason and a test.

## Before writing any non-trivial code

1. Ask what already solves it: the language standard library, the platform, an existing dependency.
2. If not, search for the canonical implementation and **cite it** (name, version, why it wins).
3. Wrap, do not fork. Pin the version. Keep a thin adapter so the choice is swappable.
4. Only then write code — and prove it with a check that fails before the change.

## Canonical pick per problem class

| Problem | Use | Not |
|---|---|---|
| Search in code | `rg` (ripgrep) | `grep -r`, hand-rolled scanning |
| Fuzzy match / dedupe | trigram or Jaro-Winkler, then exact hash | substring counting |
| Text ranking / retrieval | BM25 or TF-IDF | counting substring hits |
| Index → grid/2D mapping | `row = floor(i / COLS)`, `col = i % COLS` | dividing by rows |
| JSON / YAML / markup | real parser (`JSON.parse`, `yaml`, DOM) | regex over nested grammar |
| Diff / merge | Myers diff, `diff3` for three-way | line-by-line equality |
| Concurrency | bounded pool, `Promise.allSettled` | unbounded fan-out |
| Retries | exponential backoff + full jitter | fixed sleep |
| Hashing | BLAKE3/xxhash for speed, SHA-256 for integrity, HMAC for auth | home-grown hash |
| Caching | TTL + LRU, with negative caching | unbounded map |
| Scheduling | priority queue with aging | ad-hoc sort |
| Randomness | seeded PRNG when results must reproduce | `Math.random()` in tests |
| Float comparison | epsilon/tolerance (and a scale-aware one) | `==` on floats |
| Undo / durability | append-only journal or copy-on-write | in-place mutation |
| Validation | JSON Schema, zod, or the language's own | hand-rolled checks |
| Test strength | property-based tests for invariants, mutation testing for test quality | example-only tests |
| State machines / parsers | table-driven, or a parser generator | nested if/else |
| Numeric stability | compensated summation, integer/fixed-point when exact | naive float accumulation |

## Sharp habits

- Copy the reference implementation's *structure*, not its code; cite the source.
- Bound everything: input size, fan-out, recursion, retries, memory.
- Measure before and after; quote the number, never the impression.
- When a battle-tested option is too heavy, write down why the light one is safe.

## Sources worth trusting for the canonical version

Language and runtime docs, the algorithm's original paper, the library's own test suite and
changelog, and production systems that ship it. Avoid blog posts that never name a source.
