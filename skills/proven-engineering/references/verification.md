# Verification

The purpose here is narrow: to answer "is this choice real, and is this check capable of
failing?" before the work is built on either.

## Contents

- [Check the library against the failing case](#check-the-library-against-the-failing-case)
- [A library can be the defect](#a-library-can-be-the-defect)
- [Prove the test can fail](#prove-the-test-can-fail)
- [Audit the test double](#audit-the-test-double)
- [Name the dimension](#name-the-dimension)
- [Measure the noise floor first](#measure-the-noise-floor-first)
- [Check the harness before you trust it](#check-the-harness-before-you-trust-it)
- [A negative control is not optional](#a-negative-control-is-not-optional)

## Check the library against the failing case

The cheapest verification of a choice is the input that is already broken. Install the candidate,
run the one case that motivated the work, and read what comes out. This takes minutes and it
settles the question that a README cannot: does this library actually do the thing for *this*
input.

```sh
npm install <candidate> && node -e "import('<candidate>').then(m => console.log(m.default('the failing input')))"
```

Wins because it tests the actual claim. Loses when the input is large and the install is not — in
that case write the smallest reproduction that still fails, and keep it as the test.

## A library can be the defect

A widely used library can be wrong for your case, and the failure is delivered as a feature. The
famous slugifier whose README promises ASCII output deletes every non-Latin character, turning
Japanese, Hindi, Korean, Vietnamese, and Russian titles into `""` — an empty URL, from the
recommended tool. The Unicode-preserving alternative is no better in the other direction: it keeps
emoji, the zero-width joiner, and bidi overrides inside the slug.

So before adopting a library for "make this safe", diff it against the failing case. Install two
candidates side by side, run one corpus through both, and read what disappears. That is a
fifteen-minute check that has replaced an afternoon of debugging, and it is the check this skill's
own table rests on.

The general form: **a library's contract is narrower than its name.** Read the part of the README
that says what it removes, because that is the part that will reach you.

## Prove the test can fail

A regression test that has never failed is an assertion, not evidence. Run the new suite against
the revision that had the bug and read the failure message — it must name the defect, not a
missing element.

```sh
git stash          # or check out the pre-fix file
node --test path/to/suite
```

Expected output is a handful of failures that name the actual numbers: `434 !== 44`, not
`Cannot read property of undefined`. When the whole suite goes green against the broken
revision, the suite is measuring the wrong thing.

## Audit the test double

A stub is only evidence if it answers what the real thing answers. Every false failure traced to a
harness in this project was a stub missing a feature, and the expensive mistake was "fixing" the
application to satisfy an inaccurate double.

Check what the constructor copies, what the selector engine silently drops, and which properties
are reflected from attributes. Then ask the sharper question: which behaviour does the double
*not* model, and is the assertion relying on it? A renderer double that counts meshes but ignores
inherited visibility reported 55 draw calls where the real scene drew 52, and every extra call was
an object inside an already-hidden group.

## Name the dimension

A green suite is evidence about the dimensions it measures, and nothing else. A walk simulator
reported zero violations while a character's head passed under a beam 0.19 units too low, because
it sampled the ground and never the vertical clearance.

So when a rule grows a new dimension — height, concurrency, encoding, permissions — the check that
guards the old ones stays green and gives false confidence. Name the missing dimension explicitly
and add a check for it before trusting the suite again.

## Measure the noise floor first

A performance A/B is worthless until the unchanged build has been measured repeatedly. Four runs of
a byte-identical build here gave 16.6 / 17.0 / 22.2 / 28.4 ms — a spread wider than the effect
under test. Three mutually exclusive "optimisations" each recovered the same 4.7 ms, which is
impossible for three independent costs and is the signature of a single-threaded rasteriser
sitting just over the frame budget.

Run-to-run spread is the noise floor. A delta smaller than it is not a measurement, and an
optimisation whose benefit you could not observe should ship as *unmeasured*, not as a claim.

## Check the harness before you trust it

When a measurement disagrees with the theory, verify the measurement's own inputs first. A probe
once reported that an injected note was absent from every model request, which reads as "the
delivery mechanism is broken" — the file the guard checked had never been copied into the throwaway
config, so `existsSync` was correctly suppressing the line. Two steps were spent chasing a non-bug
before anyone asked whether the harness was telling the truth.

Related traps worth recognising on sight: a client library that normalises the URL you are trying
to test; a logger that records the search command you are searching for; a test fixture whose
environment you mutated. Each one produces confident, specific, wrong output.

## A negative control is not optional

Every check here has a "prove it can fail" step, and it is the step people skip. A check that has
only ever returned zero has not been shown to be capable of returning anything.

The pattern is always the same: take the real check, feed it a deliberately wrong input, and
require it to exit non-zero and name the defect. For a page audit, revert the fix in a patched
copy, serve that, and require the same audit to fail. For a validator, feed it a prototype key.
For this skill's probe, flip one row of the table.

If you cannot construct the failure, you have a shape that only ever says yes — which is worth
more to fix than any single bug it might be hiding.
