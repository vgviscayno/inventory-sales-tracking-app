# Git workflow

`dev` is the integration branch, not `main`.

- Branch all new work off `dev`, never off `main`.
- Open PRs against `dev`. Testing happens on `dev` (Vercel Preview deployments).
- Once `dev` is verified good, it is fast-forward merged into `main` — `main` only ever advances by fast-forward from `dev`, never by direct commits or non-ff merges.

## Fast-forward-only constraint

The `dev` → `main` merge must be fast-forward (`git merge --ff-only dev` while on `main`). This only works if `main` has no commits `dev` doesn't already contain.

The main way to break this: merging `main` back into `dev` (e.g. to resolve a conflict) creates a merge commit on `dev` that isn't a pure descendant relationship in the ff sense — actually any commit landing directly on `main` outside this flow, or reordering, causes `dev` to no longer be a fast-forward of `main`, and `--ff-only` will fail loudly rather than silently falling back to a merge commit. If that happens, rebase `dev` onto `main` (or `main` onto `dev`, whichever preserves the intended history) before retrying the fast-forward — don't drop `--ff-only` to force a merge commit through.
