---
name: land-project
description: "Fast-forward a finished build project's project branch into dev, gated on every build ticket being Done."
disable-model-invocation: true
---

# Land project

Landing early is not allowed — see [`docs/git-workflow.md`](../../../docs/git-workflow.md) for why. This skill enforces that gate; it doesn't restate the workflow around it.

1. **Identify the project branch.** If not given, search Linear projects for the `project/<slug>` marker in their description and confirm with the user which one.

2. **Check the gate.** Fetch every issue in the Linear project carrying the `build` label. If any is not Done, **stop** — list what's outstanding and don't proceed. Something genuinely urgent takes the escape hatch instead, not an early landing.

3. **Final sync.** `git checkout project/<slug> && git merge dev`. Resolve any conflicts (hand off to `resolving-merge-conflicts` if needed), then run the project's checks (typecheck, tests) on the synced branch.

4. **Propose the landing, then wait for go-ahead**:
   - `git checkout dev && git merge --ff-only project/<slug>`
   - Delete `project/<slug>` (local and remote) once the merge lands.

   If `--ff-only` is rejected here, the sync in step 3 was incomplete or something landed on `dev` in between — re-sync and retry rather than dropping `--ff-only`.
