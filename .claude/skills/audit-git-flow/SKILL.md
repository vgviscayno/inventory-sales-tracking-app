---
name: audit-git-flow
description: "Read-only check that the git-workflow invariants in docs/git-workflow.md still hold — run it whenever something about the branch state looks off, or before a promote-to-main."
---

# Audit git flow

1. **Run the checks**: `scripts/audit.sh`. It's read-only — safe to run anytime, no go-ahead needed.

2. **Interpret the output** against [`docs/git-workflow.md`](../../../docs/git-workflow.md):
   - `main is a fast-forward ancestor of dev` FAIL — `main` has commits `dev` doesn't. This is the fast-forward-only constraint breaking; the fix is the rebase `promote-to-main` step 3–4 prescribes. Don't fix it here — hand off to `promote-to-main`.
   - `CANDIDATE` branches are a heuristic, not proof — a branch cut straight off `dev` (escape hatch, pre-build discovery) looks identical to an orphaned ticket branch once `dev` has moved past where it was cut. Check each candidate against the issue tracker before calling it a problem: if its issue is closed and it long predates the current project branch, it's very likely a leftover that should be deleted; if the issue's still open or it's genuinely dev-based work, it's not a finding.

3. **Report findings and propose fixes** (delete a stale branch, hand off to `promote-to-main` for a topology break). Never delete a branch or touch `main`/`dev` history from inside this skill — propose and wait for go-ahead, same as everywhere else in this workflow.
