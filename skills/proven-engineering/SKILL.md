---
name: Proven Engineering
description: Use battle-tested algorithms, libraries, and platform primitives instead of hand-rolled variants; the canonical pick per problem class.
---

# Proven engineering

Do not invent what already exists. Standard library, then a mature library, then an algorithm you
can cite. Hand-rolling is last, and it needs a reason and a test that fails before the change.

## Canonical pick per problem class

| Problem | Use | Not |
|---|---|---|
| Search in code | `rg` | `grep -r`, hand-rolled scanning |
| Fuzzy match, dedupe | trigram or Jaro-Winkler, then exact hash | substring counting |
| Text ranking | BM25 or TF-IDF | counting substring hits |
| Index to grid | `row = floor(i / COLS)`, `col = i % COLS` | dividing by ROWS |
| JSON, YAML, markup | the real parser | regex over nested grammar |
| Diff, merge | Myers; `diff3` for three-way | line-by-line equality |
| Concurrency | bounded pool, `Promise.allSettled` | unbounded fan-out |
| Retries | exponential backoff with full jitter | fixed sleep |
| Hashing | BLAKE3 or xxhash for speed, SHA-256 for integrity, HMAC for auth | home-grown hash |
| Caching | TTL and LRU, with negative caching | unbounded map |
| Scheduling | priority queue with aging | ad-hoc sort |
| Randomness | seeded PRNG when results must reproduce | `Math.random()` in tests |
| Float comparison | epsilon or scale-aware tolerance | `==` |
| Durability | append-only journal, copy-on-write | in-place mutation |
| Validation | JSON Schema, zod, the language's own | hand-rolled checks |
| Test strength | property-based tests; mutation testing for the tests themselves | example-only tests |
| Parsers, state machines | table-driven, or a generator | nested `if`/`else` |
| Numeric stability | compensated summation, integer or fixed-point when exact | naive accumulation |

## Three habits that are not obvious

- Copy the reference implementation's *structure*, not its code, and cite the source by name and
  version. Structure is the part that carries the invariants.
- Bound everything: input size, fan-out, recursion, retries, memory. An unbounded loop is a
  latent outage.
- When the canonical option is too heavy, write down in one line why the light one is safe. That
  line is the record; without it the next reader cannot tell a decision from an oversight.

Sources that settle a question: language and runtime docs, the algorithm's paper, the library's
tests and changelog. A post that never names a source is not a source.
