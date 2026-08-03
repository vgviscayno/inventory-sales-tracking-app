# Project branches for `build` tickets

**Status:** accepted

A Linear project whose tickets carry the `build` label gets a long-lived **project branch**, `project/<short-slug>` (e.g. `project/stock-movements`). Build ticket branches are cut from it and squash-merged back into it; the project branch lands on `dev` exactly once, fast-forward, when every build ticket in the project is done. The full chain is **ticket branch → project branch → `dev` → `main`**, fast-forward at both ends.

The reason is that a build project is a feature delivered in eleven slices, and `dev` deploys to Vercel Preview. Landing slices on `dev` as they finish means `dev` — and, since `main` fast-forwards from `dev`, potentially production — carries a half-cut-over ledger for weeks. The project branch is a **feature integration line**: build work accumulates there, and `dev` sees the feature only once, whole.

The mechanics are written up in [`docs/git-workflow.md`](../git-workflow.md); this ADR records *why*.

## Considered options

**Rebasing the project branch onto `dev` instead of merging `dev` into it.** Rejected. Ticket branches hang off the project branch, so rebasing it rewrites the base out from under live work. The project branch is **never rebased** — `dev` is merged *into* it to sync.

**Incremental / milestone landing — merge the project branch into `dev` partway through.** Rejected. It reintroduces exactly the problem the project branch exists to solve: a partially cut-over ledger reaching `dev`, and from there `main`. There is one landing, at the end. Genuinely urgent work does not need to wait for it — see the escape hatch below.

**One build project at a time, so no project branch is needed.** Rejected as an unnecessary constraint. Concurrent build projects are allowed: each cuts from the `dev` tip at its own first build ticket, and the merge-`dev`-in sync rule means the second project's landing still fast-forwards cleanly.

**Enforcing the rule with a skill or a git hook.** Rejected. The rule lives in docs only. It is a workflow convention with enough judgement calls (what counts as feature work, when a discovery branch is throwaway) that mechanical enforcement would cost more than it catches.

## Consequences

- **The escape hatch matters.** Non-feature work — repo docs, tooling, unrelated bug fixes — branches off `dev` and lands on `dev` directly, never touching the project branch, which picks it up on its next sync. Without this, unrelated work is held hostage for the length of the project. This is not hypothetical: `build/01-test-harness` accumulated three repo-wide docs commits (the Linear migration, retiring `.scratch`, the spec and its eleven tickets) that had nothing to do with a test harness, which is what motivated the rule.
- **Build tickets run one at a time.** Each is cut from the project branch tip, so it sees all prior tickets' work. This is a deliberate serialisation — the slices of a cutover depend on each other.
- **One commit per build ticket** on the project branch, via squash merge. The project branch's history reads as the feature's slices, not as the churn inside each one.
- **Discovery tickets are unaffected before build starts** (`prototype`/`grilling` branches off `dev`, as today) but change during it: a mid-build discovery ticket is cut from the project branch tip so it can exercise accumulated build work, and is **never merged back**. Its answer lands in Linear; its code is deleted.
- **This is process vocabulary, not domain vocabulary.** It belongs here and in `git-workflow.md`. It deliberately does not go in `CONTEXT.md`, which is reserved for inventory/sales domain terms.
