# Git-workflow transitions as skills

**Status:** accepted

`docs/git-workflow.md` sorts into three kinds of content: **invariants** (never rebase the project branch, `main` only fast-forwards, commits are never self-initiated), which are always true and belong in `CLAUDE.md`, not behind an invocation nobody triggers; **knowledge** (why concurrent projects work, the branch-cut table's rationale), which nobody executes and stays prose in the doc; and **transitions** — steps that move code between branches, each with a checkable precondition and a real failure mode. Only the transitions became skills: `cut-branch`, `land-project`, `promote-to-main`, `audit-git-flow`. Each points at `docs/git-workflow.md` for the workflow itself rather than restating it, so the doc stays the single source of truth.

Invocation splits on blast radius. `cut-branch` and `audit-git-flow` are model-invocable — the former's worst case is an unwanted suggestion, the latter is read-only. `land-project` and `promote-to-main` change `main`'s ancestry and require an explicit invocation (`disable-model-invocation: true`). All four run their read-only checks unattended, then stop and propose the mutation for go-ahead — the same pattern `CLAUDE.md` already applies to commits.

## Considered options

**One big skill covering the whole workflow.** Rejected. A single skill can't split its invocation by blast radius — cutting a branch and fast-forwarding `main` would carry the same risk profile, forcing either everything to require explicit invocation (losing `cut-branch`'s convenience) or everything to auto-fire (letting an agent land `main` on its own).

**A skill per section of `docs/git-workflow.md`.** Rejected. Several sections — syncing the project branch with `dev`, the escape hatch, concurrent build projects, discovery-ticket lifecycle — are too thin to justify their own skill; a skill each would clutter the router with entries that add invocation overhead without adding a real precondition/failure-mode check to run.

**Skills as the source of truth, replacing the doc.** Rejected. Four skills each restating slices of the same ~90-line file is four drift surfaces. The doc stays authoritative; skills point at it.

## Consequences

- Branch-to-Linear-project mapping has no mechanical path (`docs/git-workflow.md` says the `project/<slug>` name is deliberately unlike Linear's generated names), so `cut-branch` writes the branch name into the Linear project's description as a marker, and `land-project` reads it back to find its gate.
- `audit-git-flow`'s checks are deterministic git maths, so they live in `scripts/audit.sh` inside the skill directory; the skill interprets the output and proposes fixes, never applies them.
- `promote-to-main` diagnoses why a `--ff-only` was rejected (a topology problem, not necessarily a conflict) and prescribes the rebase; if that rebase conflicts, it hands off to `resolving-merge-conflicts` rather than reimplementing conflict resolution.
