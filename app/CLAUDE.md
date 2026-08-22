@AGENTS.md

## Linting and formatting

This project uses [Biome](https://biomejs.dev) for linting and formatting (not ESLint/Prettier).
After making code changes, run `npm run lint` and fix any reported issues before considering
the change complete. Use `npm run format` to auto-fix formatting/lint issues where possible.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Convex schema changes

A schema push validates every existing document against the new validator, and the
validator is closed: a document still carrying a field the schema no longer declares
blocks the push until that field is gone.

Preview deployments are per-branch and persistent — one deployment per branch, written
to by every Vercel preview build, accumulating data for the branch's whole life. Their
data is scratch. Clear a preview from the Convex dashboard whenever a schema edit
collides with what is sitting in it.

Removing or renaming a field turns on where that field has already been written:

- **Preview only** — edit the schema in place, then clear that branch's preview deployment.
- **Reached `dev` or production** — two pushes. Push a schema declaring both the old and
  new fields, run an `internalMutation` that fills the new field and clears the old, then
  push again with the old field dropped. Write that backfill by hand and delete it once it
  has run; at this repo's table sizes it finishes inside one transaction.
