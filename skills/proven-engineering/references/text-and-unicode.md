# Text and Unicode

The three rules here are not folklore. Each one cost a real bug, and each is verified by the
reproduction at the end of its section — run them, do not trust the prose.

## Contents

- [Word boundaries are ASCII-only in JavaScript](#word-boundaries-are-ascii-only-in-javascript)
- [Case folding must run after decomposition](#case-folding-must-run-after-decomposition)
- [A `/g` regex is not a predicate](#a-g-regex-is-not-a-predicate)
- [Normalise, do not transliterate](#normalise-do-not-transliterate)

## Word boundaries are ASCII-only in JavaScript

`\b` and `\w` are defined in ECMA-262 as `[A-Za-z0-9_]`. Nothing else counts as a word
character, in any script, under any flag except `u`/`v` with an explicit property escape. So a
vocabulary built with `\b` over non-English text has dead branches, and it fails in both
directions: an alternative that can never match, and a false positive inside a longer word.

```js
/\bhậu quả\b/iu.test("hậu quả")          // false — the alternative is unreachable
/\blưu\b/iu.test("lưuý")                // true  — matches inside a longer word
/[\p{L}]/u.test("ư")                    // true  — the property escape does see it
```

The fix is a lookaround on the Unicode property, which anchors on letters and numbers everywhere:

```js
const word = (source) => new RegExp(`(?<![\\p{L}\\p{N}])${source}(?![\\p{L}\\p{N}])`, "iu");
```

`scripts/probe.mjs` does not cover these — they are language facts, not machine facts. So pin
each alternative with a test that feeds one sample word per branch. A table that looks correct in
review is not a check: the branch that never matches is invisible in review by construction.

## Case folding must run after decomposition

Folding first is not idempotent, because a caseless character can decompose into an uppercase
letter. U+1D4D6 (MATHEMATICAL BOLD SCRIPT CAPITAL G) is caseless: `toLowerCase` leaves it alone,
and its `NFKD` mapping is the ASCII `G`. Fold first, and the `G` survives into the slug — then
slugifying that slug again lowercases it to `g`, so the same title produces a different URL the
second time round.

The order that holds:

```js
s.normalize("NFKD")            // decompose: caseless characters reveal their base letters
 .replace(/\p{M}/gu, "")       // strip the marks decomposition added
 .normalize("NFC")             // re-compose: required or Hangul ships as decomposed jamo
 .toLowerCase();               // fold last, over a stable base
```

The trailing `NFC` is not optional and the strip is not either: dropping marks without
recomposing leaves neighbours broken, and folding before the mark strip is what turns `Ä°` into
`i` rather than into something else entirely.

Fuzz it. Thirteen hand-written cases all passed with the wrong order; 40 084 seeded random
inputs found 21 idempotence failures, every one of them a caseless character.

## A `/g` regex is not a predicate

`RegExp.prototype.test` on a regex carrying the `g` flag advances `lastIndex` and leaves it
there, so the same call alternates between `true` and `false` on identical input. A rubric built
on shared module-level `/g` patterns disagrees with itself: the same caption scored `6/6` on one
call and `failed: cta` on the next.

```js
const g = /lưu/giu;
g.test("lưu lại");                                    // true
g.test("lưu lại");                                    // false — lastIndex moved
new RegExp(g.source, g.flags.replace("g", "")).test("lưu lại"); // true
```

`g` is needed for `matchAll` and for nothing else. If you need a predicate, drop it; if the
pattern is shared and you cannot drop it, build a fresh `RegExp` per call. The regression test
belongs in the suite: assert the same input grades identically over five consecutive calls.

## Normalise, do not transliterate

`String.prototype.normalize` is the standard library's answer and it is the right one. What it
does *not* do is transliterate: it will never turn `đ` into `d`, and any pipeline that promises to
will quietly lose the distinction between two different words. Decide explicitly whether
compatibility mapping is a requirement, and if it is, say so in the function's name — a
`slugify` that silently rewrites letters is a `slugify` that returns different words.

Verify a normalisation change on decoded content, not on the bytes: count distinct accented
characters and grep for known strings, because a read that *displays* correctly proves nothing
about what is on disk. The corruption that bit this project was invisible in review and invisible
to a text-diff check, and only a decoded-content assertion caught it.
