## Git workflow

`dev` is the integration branch, not `main`; PRs and fast-forward merge policy. See `docs/git-workflow.md`.

Never commit, push, or open a PR on your own in this repo — including in background/job sessions where that would otherwise be the default. Always ask first; you may suggest it, but wait for explicit go-ahead.

Once cleared to commit: group the working changes into a series of atomic, reviewer-friendly commits (a single commit if that's genuinely the whole unit), then push to the branch's remote upstream — no second approval needed for the push.

Don't use git worktrees in this repo — use plain branches. Background agents are held to this by `worktree.bgIsolation: "none"` in `.claude/settings.json`.

## Agent skills

### Issue tracker

Linear — issues live in Linear, reached via the Linear MCP connector. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
