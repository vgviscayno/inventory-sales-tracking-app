# Inventory & Sales Tracking

## Language

### Process vocabulary

Git-workflow terms, not domain terms — kept here because `docs/agents/domain.md` names `CONTEXT.md` as the one glossary this repo has. See `docs/git-workflow.md` for the full workflow these terms describe.

**Project branch**:
The long-lived integration branch for a Linear project whose tickets carry the `build` label, `project/<short-slug>`. Build work accumulates here and lands on `dev` once, whole, when every build ticket is done.
_Avoid_: feature branch, integration branch (on its own — ambiguous with `dev`)

**Ticket branch**:
The short-lived branch for one build ticket, cut from the project branch tip and squash-merged back into it.
_Avoid_: feature branch, work branch

**Build ticket**:
A Linear issue carrying the `build` label — one slice of a project delivered via a ticket branch.
_Avoid_: task, story

**Discovery ticket**:
A `prototype` or `grilling` ticket that answers a design question with throwaway code. Never merged back — the answer lands in Linear as a comment; the code is deleted when the ticket is Done.
_Avoid_: spike, exploration ticket

**Escape hatch**:
The path for non-feature work (repo docs, tooling, unrelated bug fixes): branch off `dev`, land on `dev` directly, never touching a project branch. Keeps unrelated work from being held hostage for the length of a build project.
_Avoid_: fast path, side branch
