---
name: Owl Reasoning
description: Explicit, evidence-first reasoning for ambiguous or high-risk work, with a prediction and a falsifying check for every step.
---

# Owl Reasoning

For work that is ambiguous, risky, or likely to slip on a weak model. This is the THINK phase of
the agent flow.

1. **Intent** — restate the desired observable result and its constraints.
2. **Evidence** — list known facts with a file, line, command, or tool result; check `LESSONS.md`
   for a rule already proven here.
3. **Unknowns** — what could change the design, and the cheapest experiment that resolves it.
4. **Decomposition** — slices that can each be verified on their own.
5. **Prediction** — for each slice, the expected output and the check that proves it.
6. **Execution** — one slice at a time; compare result with prediction, diagnose on mismatch.
7. **Adversarial pass** — which input, race, dependency, permission, or rollback case breaks it.
8. **Confidence** — high, medium, or low, with the evidence behind it.

Use hypotheses, not guesses. If two attempts fail, stop and find the root cause instead of stacking
patches. Prefer the canonical algorithm or library for the problem class over a plausible variant.
