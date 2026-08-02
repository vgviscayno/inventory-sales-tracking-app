# Issue tracker: Linear

Issues and specs (you may know a spec as a PRD) for this repo live in **Linear**.

## Access

Skills reach Linear through the **Linear MCP server** (`mcp__linear-server__*` tools).
The connector is not always enabled — before doing tracker work, check whether those
tools are available:

- **Available** — use them directly.
- **Not available** — stop and tell the user the Linear connector needs enabling for
  this session. Do not silently fall back to writing markdown files.

There is no `linear` CLI installed in this repo; don't try to shell out to one.

## Conventions

- One **project** (or parent issue) per feature; implementation tickets are issues
  within it, so a spec and its tickets stay linked.
- The spec lives as the project description, or as a dedicated issue titled
  `Spec: <feature>` when there's no project.
- Triage state is expressed with Linear **labels** — see `triage-labels.md`.
- Conversation history goes in issue **comments**, not by editing the description.

## When a skill says "publish to the issue tracker"

Create a Linear issue. Put the ticket body in the description, apply the triage label,
and attach it to the feature's project/parent issue. Report the issue identifier
(e.g. `ENG-142`) and URL back to the user.

## When a skill says "fetch the relevant ticket"

Read the Linear issue by its identifier. The user will normally pass the identifier
or a Linear URL directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a parent issue with one **child** sub-issue per ticket.

- **Map**: a parent issue titled `Map: <effort>` — the Notes / Decisions-so-far / Fog
  body lives in its description.
- **Child ticket**: a sub-issue of the map. The ticket type
  (`research`/`prototype`/`grilling`/`task`) is a label; ordering comes from Linear's
  own issue order.
- **Blocking**: use Linear's native **blocked-by** issue relations. A ticket is
  unblocked when every issue blocking it is Done or Canceled.
- **Frontier**: among the map's sub-issues, the open, unblocked, unassigned ones;
  first in issue order wins.
- **Claim**: assign the issue to the current user and move it to In Progress before
  any work.
- **Resolve**: post the answer as a comment, move the issue to Done, then append a
  context pointer (gist + issue link) to the map issue's Decisions-so-far.
