---
name: cut-branch
description: "Use when starting work on a ticket, or when you need to know which branch to cut from and what to name it."
---

# Cut branch

The branch-cut table and its rationale live in [`docs/git-workflow.md`](../../../docs/git-workflow.md) — this skill applies that table, it doesn't repeat it.

1. **Classify the work** against the table: a build ticket (Linear `build` label), the first build ticket of a new build project, pre-build discovery, mid-build discovery, or everything else (the escape hatch).

2. **Find the project branch, if the work needs one** (build ticket or mid-build discovery). Search the Linear project's description for a `project/<slug>` marker.
   - **Found** — that's the base.
   - **Missing, and this is the project's first build ticket** — no project branch exists yet; you're about to create one. Pick a slug deliberately unlike Linear's generated names, propose `project/<slug>` cut from `dev`'s tip.
   - **Missing, and tickets already exist in this project** — stop and ask; don't guess or silently create a second project branch.

3. **Choose the branch name.**
   - Ticket branch — Linear's generated branch name verbatim.
   - Project branch — the hand-picked `project/<slug>` from step 2.
   - Discovery or escape hatch — a short descriptive name, no fixed convention.

4. **Propose base and name, then wait for go-ahead** before cutting — same pause as any other mutation in this repo. Once cleared:
   - `git checkout <base> && git checkout -b <name>`
   - If this created a new project branch, also write `<name>` into the Linear project's description (append, don't overwrite) — `land-project` finds its gate by searching for this marker.
