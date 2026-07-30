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
