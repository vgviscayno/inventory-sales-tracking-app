---
name: promote-to-main
description: "Fast-forward dev into main, diagnosing and repairing the topology when the fast-forward is rejected."
disable-model-invocation: true
---

# Promote to main

`main` only ever advances by fast-forward from `dev` — see the fast-forward-only constraint in [`docs/git-workflow.md`](../../../docs/git-workflow.md) for what breaks it and why.

1. **Check ff-ability.** `git merge-base --is-ancestor main dev`. If it succeeds, `main` is a strict ancestor of `dev` and the fast-forward will go clean.

2. **Clean case — propose, then wait for go-ahead:**
   - `git checkout main && git merge --ff-only dev`

3. **Rejected case — diagnose the topology, don't just retry.** Run `git log dev..main` to find what `main` has that `dev` doesn't. This is what's breaking the fast-forward — typically a merge commit from `main` having been merged back into `dev`, or a commit landed on `main` directly outside this flow.

4. **Prescribe the rebase that preserves the intended history** — rebase `dev` onto `main`, or `main` onto `dev`, whichever keeps the real history (usually `dev` onto `main`, since `main` should never carry work `dev` doesn't). Propose the specific command; wait for go-ahead.

5. **If the rebase conflicts, hand off to `resolving-merge-conflicts`** rather than resolving hunks here. Once it's clean, return to step 1.

Never drop `--ff-only` to force a merge commit through, even under pressure to unblock — that's exactly the failure this whole flow exists to prevent.
