---
name: Self-Evolution
description: Improve behavior through bounded, evidence-backed doctrine changes — prompts, routing, and checklists, never model weights.
---

# Self-Evolution

This changes behavior, not weights: doctrine lines in `AGENTS.md`, tool routing, checklists, and
`LESSONS.md`. It is not training a model and it does not pretend to be.

## Loop

1. Read `LESSONS.md` and look for a pattern, not a single incident.
2. Demand evidence: a real check with exit code and output, a quoted user correction, or a bug
   reproduced and then fixed. Inference is not evidence.
3. Propose the **smallest** change that removes the cause: one doctrine line, one routing rule,
   one checklist item.
4. Apply it only after review, and keep the exact rollback line next to it.
5. Re-run a representative check to confirm the change helps and breaks nothing.
6. Stop when the evidence runs out. A quiet cycle is a healthy cycle.

Never store credentials, private source text, guesses, or anything that conflicts with the
current user instruction. A lesson is a note to consult, never an authority.
