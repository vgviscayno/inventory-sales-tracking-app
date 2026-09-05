# Git workflow

`dev` is the integration branch, not `main`.

- Open PRs against `dev`. Testing happens on `dev` (Vercel Preview deployments).
- Once `dev` is verified good, it is fast-forward merged into `main` — `main` only ever advances by fast-forward from `dev`, never by direct commits or non-ff merges.

Where a branch is cut from depends on what it is:

| Work | Branch off | Lands on |
| --- | --- | --- |
| Build ticket (`build` label) | the project branch | the project branch, squash-merged |
| A whole build project | `dev`, once, at its first build ticket | `dev`, once, fast-forward |
| Pre-build discovery (`prototype` / `grilling`) | `dev` | nowhere — deleted |
| Mid-build discovery | the project branch tip | nowhere — deleted |
| Everything else (docs, tooling, unrelated bugs) | `dev` | `dev` |

## Deployments

Every Vercel build deploys that same commit's Convex functions, because the build command is `npx convex deploy --cmd 'npm run build'` (in `app/vercel.json`). Which Convex backend it targets follows from the `CONVEX_DEPLOY_KEY` Vercel hands the build:

| Vercel environment | Convex backend |
| --- | --- |
| Production (`main`) | the project's production deployment |
| Preview (every other branch, `dev` included) | a per-branch `preview/<branch>` deployment, created on first build |

Two consequences for anyone testing on a preview:

- A `preview/<branch>` backend starts with an **empty database**. Data you enter there belongs to that branch alone.
- It is **deleted 5 days after it was created**, `preview/dev` included. Long-lived test data on a preview does not survive; re-enter it, or import a snapshot (`npx convex export`, then `npx convex import --preview-name preview/dev snapshot.zip`).

`npx convex dev` is for local development only. It is not part of getting a preview deployment to work — if a preview looks broken, read the Vercel build log's `convex deploy` step rather than pushing functions from your machine.

## Project branches

A **build project** — a tracking issue whose sub-issues carry the `build` label — gets a long-lived **project branch**, named `project/<short-slug>` — e.g. `project/stock-movements`. The slug is hand-picked and deliberately unlike the branch names GitHub generates from an issue, so the integration line stands out in `git branch`.

The project branch is a **feature integration line**, not merely a stable base. Build work accumulates on it and `dev` sees the feature only once, whole. The full chain is:

```
ticket branch → project branch → dev → main
```

fast-forward at both ends. Rationale and rejected alternatives: [ADR-0001](./adr/0001-project-branches-for-build-tickets.md).

### Syncing with `dev`

Merge `dev` *into* the project branch:

```sh
git checkout project/stock-movements
git merge dev
```

**Never rebase the project branch.** Ticket branches hang off it; rebasing rewrites their base out from under them.

### Running build tickets

One ticket at a time. Cut from the project branch **tip**, finish it, merge it back, then cut the next — so each ticket sees all prior tickets' work.

Use the branch name GitHub generates from the issue verbatim, e.g. `23-build-02-ledger-foundation-and-sale-cutover`.

Land it by PR into the project branch, **squash-merged** — one commit per build ticket. Delete the ticket branch on merge.

### Landing the project

Only when every build ticket in the project is done. Early or milestone landing is not allowed: `main` fast-forwards from `dev`, and a half-finished cutover must not reach production. Anything genuinely urgent takes the escape hatch below instead.

Final `dev` sync, verify, then:

```sh
git checkout dev
git merge --ff-only project/stock-movements
```

No merge commit — so the `dev` → `main` fast-forward below survives by construction. Delete the project branch afterwards.

### Concurrent build projects

Allowed. Each cuts from the `dev` tip at its own first build ticket. Because every project merges `dev` in as it goes, the second project's landing still fast-forwards cleanly.

### Escape hatch

Non-feature work — repo docs, tooling, unrelated bug fixes — branches off `dev` and lands on `dev` directly, and never touches the project branch. The project branch picks it up on its next sync. Nothing is held hostage for the length of a build project.

### Discovery tickets

Pre-build `prototype` / `grilling` tickets branch off `dev`, as always. A discovery ticket raised *mid-build* is cut from the project branch tip instead, so it can exercise the accumulated build work.

Neither is ever merged back. The answer lands on the issue as a comment; the code is deleted when the issue is closed.

## Commits

Committing is never self-initiated — wait for explicit go-ahead. Once given, the go-ahead covers the whole sequence below; don't come back for a second approval to push.

Shape the branch's working changes into a **series of atomic commits**, each a logical unit a human can review on its own — schema change, then the code that uses it, then its tests, and so on. A single commit is fine when the change genuinely is one unit; several tiny mechanical commits are not better than one coherent one.

Then push to the branch's remote upstream (`git push -u origin <branch>` the first time).

Ticket branches are squash-merged into the project branch, so this commit series is reviewer scaffolding, not permanent history — it exists to make the PR readable and disappears on merge.

## Fast-forward-only constraint

The `dev` → `main` merge must be fast-forward (`git merge --ff-only dev` while on `main`). This only works if `main` has no commits `dev` doesn't already contain.

The main way to break this: merging `main` back into `dev` (e.g. to resolve a conflict) creates a merge commit on `dev` that isn't a pure descendant relationship in the ff sense — actually any commit landing directly on `main` outside this flow, or reordering, causes `dev` to no longer be a fast-forward of `main`, and `--ff-only` will fail loudly rather than silently falling back to a merge commit. If that happens, rebase `dev` onto `main` (or `main` onto `dev`, whichever preserves the intended history) before retrying the fast-forward — don't drop `--ff-only` to force a merge commit through.
