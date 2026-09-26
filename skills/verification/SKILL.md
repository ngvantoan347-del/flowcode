---
name: Verification
description: Verify behavior with real commands, negative cases, diff review, and concise evidence before reporting completion.
---

# Verification

Use the narrowest check that can falsify the claim, then broaden if practical. Record command, working directory, exit code, and salient output. Check at least one negative or boundary case when the change handles input, auth, files, retries, concurrency, or data loss. Inspect the final diff for secrets and unrelated edits. A missing check is a reported gap, never an implied pass.
