## Git workflow

`dev` is the integration branch, not `main`.

Never commit, push, or open a PR on your own in this repo — including in background/job sessions where that would otherwise be the default. Always ask first; you may suggest it, but wait for explicit go-ahead. Once cleared, the commit shape and push are covered in `docs/git-workflow.md`.

Don't use git worktrees in this repo — use plain branches. Background agents are held to this by `worktree.bgIsolation: "none"` in `.claude/settings.json`.

Everything else — branch cuts, landing a project, promoting `dev` to `main`, the escape hatch — is in `docs/git-workflow.md`, with `/cut-branch`, `/land-project`, `/promote-to-main`, and `/audit-git-flow` as the skills that execute it.

## Agent skills

### Issue tracker

Linear — issues live in Linear, reached via the Linear MCP connector. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
