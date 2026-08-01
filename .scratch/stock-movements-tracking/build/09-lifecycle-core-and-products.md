# 09 — Entity lifecycle core, and product archive/delete

**What to build:** things she is done with can leave her lists without taking their history with them. She archives a product she no longer stocks — it leaves the Register grid and the Products list, stops counting as low stock (a discontinued item sitting at 2 units stops nagging her forever), and its record stays intact. Archived products live in a **collapsed Archived section** at the bottom of the Products list showing how many are in it, so archived things are findable rather than gone, and unarchiving from the detail page is one tap when seasonal stock comes back.

Archiving a product that still has stock warns naming the count and takes one confirm — deliberately the same warn/confirm shape as the negative-stock rule, so the app has one pattern — but never blocks. **Delete** only appears once a product is archived, so the destructive action is never one tap away from an active row, and it is **visible but disabled with its reason inline** ("7 still on hand — pull them out first") rather than hidden, so she learns how to get to it instead of wondering where it went. A deleted product's name keeps rendering on past sales and deliveries: deleting something never blanks out history.

Two rules govern all of this:

> **Gate the irreversible action, never the reversible one.**
> **Lifecycle filters selection surfaces, never arithmetic.**

This ticket builds the shared machinery once — for products and customers now, and for suppliers in ticket 11.

- **Uniform two-state model** (`archivedAt` + `deletedAt`, absent means active). Per-entity variation lives in the **gates**, not in which states exist.
- **Archive** is reversible and user-facing; **delete** is one-way in the UI and hidden from every list, soft *only* so history keeps rendering names. Neither state is selectable anywhere; both keep rendering their name on past entries.
- **Delete requires archive first, on every entity**, in addition to any entity-specific gate. That is what makes "archive is never gated" safe.
- **Enforcement seam:** `list` takes `include: "active" | "withArchived"`, defaulting to active; **no argument on any query ever returns soft-deleted rows** — archive is a view you can switch to, delete is not. `get` resolves any row regardless of state and returns the lifecycle fields so callers can badge it. That one rule covers every "excluded from search, included by id" case. Filtering is **server-side in the handlers**, via a shared lifecycle module (`isActive` / `filterLifecycle`) rather than the predicate retyped in six places.
- **Every gate is checked server-side in the mutation**, not only in the UI — the disabled button is an affordance, the throw is the guarantee. The delete check is two conditions: archived **and** the entity gate.
- **Archiving a product freezes stock, never blocks it.** `quantityOnHand` and every movement row are untouched — archive changes visibility, never arithmetic, so the invariant gets no second way to break.
- **Product delete gate:** blocked while `quantityOnHand !== 0`, **including negative** — a deleted-while-negative product is an unreconcilable cache row with no UI left to repair it. `products.remove` changes from a hard `ctx.db.delete` to a `deletedAt` patch.
- **No index on the lifecycle fields.** Every handler in these files already collects the whole table and filters in JS; at ~100 SKUs a predicate is noise.

**A known rough edge, expected rather than accidental:** the product delete gate is not free the way the customer one is. A typo product born from "+ Add as new product" arrives *with* stock, because the delivery line that created it put units on it. Cleanup composes — reopen the entry, re-point or drop the line, the ghost falls to 0, archive, delete. Expect to walk that path rather than treat it as a bug.

**Blocked by:** 06 — Product detail becomes the per-product ledger.

**Status:** ready-for-agent

- [ ] `archivedAt` and `deletedAt` are optional fields on `products` and `customers`, absent meaning active
- [ ] A shared lifecycle module exposes `isActive` / `filterLifecycle`, used by every handler that filters
- [ ] Every `list` takes `include: "active" | "withArchived"` defaulting to active, and **never** returns soft-deleted rows under any argument
- [ ] Every `get` resolves a row in any state and returns its lifecycle fields
- [ ] Archive and unarchive mutations exist for products and customers, and archive is never gated
- [ ] The reusable collapsed Archived section component is built once, shows its count when collapsed, and is placed at the bottom of the Products list
- [ ] The product detail page shows Archive in place of today's hard Delete; when archived it shows an Archived badge, Unarchive, and Delete
- [ ] Archiving a product with stock warns naming the count and takes one confirm; the count and its movement rows are unchanged afterwards
- [ ] Archived products no longer carry low-stock status and no longer appear in the Register grid or any picker
- [ ] Delete is visible but disabled with its reason inline while the count is non-zero, including negative
- [ ] `products.remove` soft-deletes, and throws unless the product is archived **and** its count is 0
- [ ] A deleted product's name still renders on past sales and deliveries and on the ledger
