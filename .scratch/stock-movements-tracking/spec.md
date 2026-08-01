Status: ready-for-agent

# Spec: Stock Movements (Deliveries & Pull-Outs)

Synthesised from the [stock movements map](map.md) and its eight resolved tickets ([01](issues/01-core-data-model.md)–[08](issues/08-entity-lifecycle.md)). Where this spec and a ticket disagree, this spec wins — several tickets were amended by later ones (notably [03](issues/03-logging-flow-prototype.md)'s entry point by [05](issues/05-movement-history-surface.md), and [01](issues/01-core-data-model.md)'s required `supplierId` by [07](issues/07-supplier-management-surface.md)).

## Problem Statement

The shop owner runs a sari-sari store from her phone. The app already records sales through the Register, but stock only moves *out* through a sale. Everything else that changes a count — a delivery from a supplier, a case of soft drinks that got crushed, expired stock pulled off the shelf, a pack taken home for personal use, a bag given to a neighbour — has no home. Her only way to reflect any of it is to open the product and type a new number into the quantity-on-hand field.

That produces four problems she feels daily:

1. **The number lies about why.** `quantityOnHand` says 7. It cannot say whether that 7 is because 40 arrived on Tuesday and 33 sold, or because someone typed 7 over the real count. When the shelf and the phone disagree, there is nothing to reconstruct from — she has to recount and overwrite, which is how the drift started.
2. **Deliveries vanish.** She restocks from several suppliers and cannot answer "when did we last get Lucky Me, and from whom?" or "did that delivery ever actually get typed in?" The delivery is not a thing the app has ever heard of.
3. **Losses are invisible.** Damaged, expired, personal use, given away — each one silently shrinks the count with no record that it happened or why. She has no way to see that she is losing more to expiry than to anything else.
4. **A typo is permanent and untraceable.** Typing 70 instead of 7 into the quantity field leaves no trail. There is nothing to correct, only a number to retype — and no way to notice the mistake later.

Underneath, the same problem hits the developer: `quantityOnHand` is a free-standing number anyone can patch, so it is nobody's derived value and nothing can verify it.

## Solution

Every change in stock becomes a **stock movement** — a recorded, dated, attributable row in one ledger. Sales already move stock and join that ledger; **deliveries** (stock in, optionally attributed to a **supplier**) and **pull-outs** (stock out, with a structured **reason category** and notes) become first-class things she logs; and a one-time **opening balance** per product anchors the ledger to whatever the counts are on launch day.

`quantityOnHand` stops being something anyone types. It becomes the running total of that ledger — cached on the product for speed, but patched only by movements, and rebuildable from the ledger at any time. The quantity field disappears from the product form.

Two surfaces expose it, each using its natural unit:

- **The product detail page becomes the ledger for that product** — every movement, newest first, grouped by day, each row showing what happened, the signed change, and the **running balance after it**. This is the "why does it say 7?" surface, and it sits directly under the number it explains.
- **Movements becomes a 4th nav tab** — one row per logged entry across all products (label, time, product count, product names, net change), and the **only** place logging starts. `+ Delivery` and `− Pull-out` at the top open a bottom sheet that works exactly like the Register checkout sheet she already knows.

Logging a delivery or pull-out is a **grouped multi-product entry**: one header, many lines, built the same way a checkout basket is built. Entries are **editable and deletable afterwards** by reopening that same sheet — because the whole point is that a mistake is now a record you can fix, not a number you have to remember was wrong.

Stock is allowed to go **negative**, loudly. Nothing hard-rejects a write; a write that would drive a product negative warns her by name and count ("only 3 on hand") and takes one confirm. A negative number is the most useful thing the app can say — it localises the drift to one product and tells her to recount.

Finally, products, customers and suppliers all gain a real **lifecycle**: **archive** (reversible, "I'm done with this, keep the record") and **delete** (one-way in the UI, soft underneath so past entries keep rendering names). Delete always requires archive first.

## User Stories

### Logging a delivery

1. As a shop owner, I want a `+ Delivery` button at the top of the Movements tab, so that logging a restock starts from the same place I go to see what has been logged.
2. As a shop owner, I want the delivery sheet to look and work like the Register checkout sheet, so that I do not have to learn a second way to build a list of products on my phone.
3. As a shop owner, I want to add several products to one delivery, so that a restock that arrived as one shipment is recorded as one thing.
4. As a shop owner, I want to search for a product by typing part of its name, so that I can find it without scrolling a 100-item list on a phone.
5. As a shop owner, I want `−` / `+` steppers on each line, so that I can adjust a quantity with my thumb rather than a keyboard.
6. As a shop owner, I want to type a quantity directly when it is large, so that logging 48 units does not take 48 taps.
7. As a shop owner, I want to remove a line I added by mistake before saving, so that a mis-tap does not force me to start the entry over.
8. As a shop owner, I want to log a delivery containing a product I have never stocked before, so that a new item entering the shop does not require me to leave the sheet and create it elsewhere first.
9. As a shop owner, I want the option "+ Add *X* as new product" when my search matches nothing, so that creating the product happens inline in the flow that needed it.
10. As a shop owner, I want a new product's line to be visibly badged as new and to ask me for its selling price inline, so that I cannot accidentally create a product with no price.
11. As a shop owner, I want to attach a supplier to a delivery, so that I can later see who I bought from.
12. As a shop owner, I want to create a supplier by typing a name I have not used before, so that a new supplier does not block me mid-log.
13. As a shop owner, I want to save a delivery **without** a supplier, so that stock bought retail, received as a gift, or from someone I do not need to name is still recordable.
14. As a shop owner, I want saving the delivery to raise each product's count by its line quantity, so that the shelf and the phone agree without me typing a total.

### Logging a pull-out

15. As a shop owner, I want a `− Pull-out` button beside `+ Delivery`, so that recording stock leaving for a non-sale reason is as easy as recording stock arriving.
16. As a shop owner, I want to pick a reason from a fixed short list — damaged, expired, personal use, given away, other — so that my losses are categorised consistently instead of described differently every time.
17. As a shop owner, I want to add a freeform note to a pull-out, so that I can capture the detail the category cannot ("box fell off the tricycle").
18. As a shop owner, I want the app to require a note when I choose "other", so that a reason that means nothing on its own is never left unexplained.
19. As a shop owner, I want to pull out several products in one entry, so that clearing a shelf of expired stock is one record rather than five.
20. As a shop owner, I want saving the pull-out to lower each product's count, so that the loss is reflected immediately.

### Seeing why a number is what it is

21. As a shop owner, I want the product detail page to list every movement for that product, so that the count at the top of the page has its own explanation directly beneath it.
22. As a shop owner, I want that list to include sales alongside deliveries and pull-outs, so that nothing that changed the number is missing from the explanation of the number.
23. As a shop owner, I want each row to show the running balance after that movement, so that I can find the exact point where the count became wrong.
24. As a shop owner, I want rows grouped under day headings with the newest first, so that "what happened yesterday" is near the top where I look.
25. As a shop owner, I want a delivery row to name its supplier, so that I can see where that stock came from without opening anything.
26. As a shop owner, I want a pull-out row to show its reason and note, so that I can see why stock left without opening anything.
27. As a shop owner, I want a sale row to show its line total, so that the ledger reads consistently with the money surfaces.
28. As a shop owner, I want the opening balance to appear as the first, oldest row, so that the ledger starts from a stated number rather than from nowhere.
29. As a shop owner, I want a long history to stay fast to scroll, so that a product I sell every day is still usable a year in.
30. As a shop owner, I want the quantity-on-hand input gone from the product form, so that I am never tempted to fix a number in the one way that destroys the record of why it was wrong.

### Seeing what was logged, across products

31. As a shop owner, I want a Movements tab in the main nav, so that logging and history live in one place I can reach in one tap from anywhere.
32. As a shop owner, I want one row per logged entry, so that a five-product delivery reads as one delivery rather than five events.
33. As a shop owner, I want each row to show the time, the product count, the product names and the net change, so that I can recognise an entry without opening it.
34. As a shop owner, I want deliveries and pull-outs shown by default and sales excluded, so that the tab shows the things I logged here rather than being flooded by the Register.
35. As a shop owner, I want filters for deliveries only, pull-outs only, and an opt-in to include sales, so that I can narrow to what I am actually looking for.
36. As a shop owner, I want day headings and windowing here too, so that the tab reads the same way as the product ledger.

### Correcting a mistake

37. As a shop owner, I want to tap an entry to reopen it in the same sheet I logged it with, so that correcting it uses the skills I already have.
38. As a shop owner, I want to change a line's quantity and save, so that a typed 70 that should have been 7 is fixable.
39. As a shop owner, I want the product's count to move by exactly the difference I made, so that correcting an entry does not double-count or under-count.
40. As a shop owner, I want to change a delivery's supplier after the fact, so that picking the wrong one — or none — is not permanent.
41. As a shop owner, I want to add a line to an existing entry, so that a product I forgot from a shipment can join the shipment it belonged to.
42. As a shop owner, I want to drop a line from an entry, so that a product that was never in that delivery stops counting toward it.
43. As a shop owner, when I open an entry from a product page, I want that product's line highlighted and the others marked "also in this entry", so that I am not surprised to be editing lines for products I was not looking at.
44. As a shop owner, I want to delete a whole entry, so that a delivery I logged twice can be removed entirely.
45. As a shop owner, I want deleting to take two taps with a clear confirm, so that I do not destroy a record with a mis-tap on a phone.
46. As a shop owner, I want deleting an entry to reverse its effect on every product it touched, so that the counts return to what they would have been.
47. As a shop owner, when I remove the last line and save, I want to be told that this deletes the entry and asked to confirm, so that an entry never disappears silently.
48. As a shop owner, I want sale entries to be visible in history but not editable there, with a note saying they are edited from the Register, so that I know where to go rather than wondering why nothing happens.
49. As a shop owner, I want opening-balance rows to be visible but not editable, so that the ledger's starting point is stable.

### Stock going negative

50. As a shop owner, I want to complete a sale even when the app thinks there is not enough stock, so that a customer standing at the counter with the goods in hand never results in an unrecorded sale.
51. As a shop owner, I want an unrecorded sale to be impossible to be forced into, so that an utang balance is never permanently wrong because the app refused a write.
52. As a shop owner, I want a warning naming the product and its actual count ("only 3 on hand") before a write takes it negative, so that I can catch a typo before it lands.
53. As a shop owner, I want that warning to take one confirm and never block me, so that the app tells me something is off without deciding for me.
54. As a shop owner, I want the same warning in the pull-out sheet as in the Register, so that there is one rule to remember rather than two.
55. As a shop owner, I want the same warning when an edit or a delete would drive something negative, so that the guard covers every way the number can move.
56. As a shop owner, I want a delete that also drives stock negative to say so inside the delete confirm rather than stacking a second dialog, so that one destructive gesture stays one confirm.
57. As a shop owner, I want a negative count shown with a loud badge distinct from "low stock", so that "this count is wrong, recount" never reads as "order more".
58. As a developer, I want a server-side backstop that rejects a negative-driving write unless the caller declares it confirmed, so that a script or a future surface cannot quietly drive stock negative with nobody warned.

### Suppliers

59. As a shop owner, I want a Suppliers page reachable from the Movements tab, so that I can clean up the supplier list without a fifth nav tab crowding the bar.
60. As a shop owner, I want to create a supplier from that page as well as inline from a sheet, so that I can set them up deliberately when I am not mid-log.
61. As a shop owner, I want to rename a supplier by tapping its row, so that a name I typed too fast during a delivery can be fixed.
62. As a shop owner, I want to keep notes on a supplier ("bought from the palengke, ask for Nita"), so that the thing I actually need to remember about them lives with them.
63. As a shop owner, I want to archive a supplier I no longer buy from, so that they stop appearing in the picker without erasing the deliveries they supplied.
64. As a shop owner, I want to unarchive a supplier from a collapsed Archived section, so that starting to buy from them again is one tap.
65. As a shop owner, I want to delete a junk supplier created by a typo, so that the picker does not accumulate garbage forever.
66. As a shop owner, I want an archived supplier already attached to a delivery to still show by name when I edit that delivery, flagged as archived, so that editing an unrelated field never silently blanks who supplied it.

### Product and customer lifecycle

67. As a shop owner, I want to archive a product I no longer stock, so that it leaves the Register grid and the Products list without taking its history with it.
68. As a shop owner, I want an archived product to stop counting as low stock, so that a discontinued item sitting at 2 units stops nagging me forever.
69. As a shop owner, when I archive a product that still has stock, I want a warning naming the count and one confirm, so that I know those units will not be sellable until I unarchive.
70. As a shop owner, I want a collapsed Archived section at the bottom of the Products list showing how many are in it, so that archived things are somewhere findable rather than gone.
71. As a shop owner, I want to unarchive a product from its detail page, so that seasonal stock coming back is one tap.
72. As a shop owner, I want Delete to appear on a product only once it is archived, so that the destructive action is never one tap away from an active row.
73. As a shop owner, I want Delete disabled with its reason inline ("7 still on hand — pull them out first") rather than hidden, so that I learn how to get to it instead of wondering where it went.
74. As a shop owner, I want a deleted product's name to keep rendering on past sales and deliveries, so that deleting something never blanks out history.
75. As a shop owner, I want to edit a customer's name and notes from their profile, so that a name typed quickly at the counter can be corrected.
76. As a shop owner, I want to archive a customer, so that someone who has stopped coming leaves my main list.
77. As a shop owner, I want to archive a customer **even when they owe money**, so that the person I most want off the main list is not the one case the feature refuses.
78. As a shop owner, I want the Customers Archived section header to show the total still owed by archived customers, so that archiving never hides money.
79. As a shop owner, I want Delete blocked on a customer with a non-zero balance, with the amount named ("Nita owes ₱240 — settle first"), so that a debt cannot be erased by tidying up.
80. As a shop owner, I want a settled customer with years of history to still be deletable, so that history alone never traps a row on my list forever.
81. As a shop owner, I want archived and deleted products, customers and suppliers to never appear in any picker, so that I cannot attach a retired thing to a new record.

### Launch and data

82. As a shop owner, I want each product's current count recorded as an opening balance when the feature launches, so that my ledger starts from the real shelf rather than from zero.
83. As a shop owner, I want my product catalog and customer list to survive the change, so that the tedious data I already entered is not lost.
84. As a developer, I want the cached `quantityOnHand` to always equal the sum of that product's ledger rows, so that the cache can be rebuilt and verified rather than trusted.
85. As a developer, I want the opening-balance backfill to be safe to run twice, so that a slip across two deployments does not silently double every count.

## Implementation Decisions

### Schema

One flat `stockMovements` table tagged by `type`, not per-type header/line tables plus a redundant ledger — unifying sales, deliveries and pull-outs is the whole point, and separate tables would mean duplicate writes and two sources of truth for one fact. `saleItems` is **removed**; each sale line becomes a `stockMovements` row.

The schema below is the locked shape from ticket 01, amended by ticket 07 (optional `supplierId`) and ticket 08 (lifecycle fields):

```ts
products: defineTable({
  name: v.string(),
  sellingPrice: v.number(),
  quantityOnHand: v.number(),        // cached running total, maintained by movements
  lowStockThreshold: v.optional(v.number()),
  archivedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
}),

customers: defineTable({
  name: v.string(),
  notes: v.optional(v.string()),
  archivedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
}),

suppliers: defineTable({
  name: v.string(),
  notes: v.optional(v.string()),
  archivedAt: v.optional(v.number()),
  deletedAt: v.optional(v.number()),
}),

sales: defineTable({                 // header, unchanged
  customerId: v.optional(v.id("customers")),
  paymentMethod: v.union(v.literal("cash"), v.literal("utang")),
  createdAt: v.number(),
}).index("by_customer", ["customerId"]),

deliveries: defineTable({
  supplierId: v.optional(v.id("suppliers")),   // optional per ticket 07
  createdAt: v.number(),
}),

pullouts: defineTable({
  createdAt: v.number(),
}),

stockMovements: defineTable({
  type: v.union(
    v.literal("sale"), v.literal("delivery"),
    v.literal("pullout"), v.literal("opening"),
  ),
  refId: v.optional(
    v.union(v.id("sales"), v.id("deliveries"), v.id("pullouts")),
  ),                                  // undefined for "opening" rows
  productId: v.id("products"),
  quantity: v.number(),               // signed: +delivery/opening, -sale/pullout
  unitPriceAtSale: v.optional(v.number()),   // only when type === "sale"
  reasonCategory: v.optional(v.string()),    // only when type === "pullout"
  reasonNotes: v.optional(v.string()),       // only when type === "pullout"
  createdAt: v.number(),
})
  .index("by_product", ["productId"])
  .index("by_refId", ["refId"]),
```

Decisions encoded there, and why:

- **`quantity` is a signed delta** — positive for `delivery`/`opening`, negative for `sale`/`pullout`. Every cache update is then a plain add with no per-type branching: create patches by `quantity`, edit by `(newQuantity - oldQuantity)`, delete by `-quantity`.
- **`quantityOnHand` stays a cached running total on `products`**, patched transactionally inside every movement insert/edit/delete — not summed on read. `products.list` is the highest-traffic read in the app, and summing full history per product only gets worse as the ledger grows. The `by_product` index exists so the cache can be rebuilt from the ledger; **cache == ledger-sum is the invariant everything else protects.**
- **`refId` is one polymorphic optional field**, not three mostly-null `saleId`/`deliveryId`/`pulloutId` columns — one field to index, joined back via `by_refId`.
- **`reasonCategory` is a plain `v.string()`**, with the fixed set enforced in the mutation's args validator rather than as a schema-level union, so changing the category list is a mutation-level change and not a schema migration.
- **No index on the lifecycle fields.** Every handler in these files already `.collect()`s the whole table and filters in JS; at ~100 SKUs a predicate is noise, and a lifecycle index would be the only indexed access pattern in a file of full scans.

### Pull-out reason categories

Fixed set: `damaged`, `expired`, `personal use`, `given away`, `other`. Freeform notes optional for the first four and **mandatory for `other`** — it carries no meaning on its own. Enforced in the pull-out create mutation's validator; an `other` pull-out with missing or empty `reasonNotes` is rejected.

### Ledger writes

- **`sales.create` writes `stockMovements` rows** (`type: "sale"`, negative `quantity`, `unitPriceAtSale` captured from the product's selling price at the time, `refId` = the sale id) instead of `saleItems` rows, and patches `quantityOnHand` by a **signed delta** rather than setting it absolutely.
- **Delivery and pull-out creates take a header + an array of lines**, insert the header, insert one movement row per line, and patch each product by the signed delta — one mutation per entry, matching the one-save-one-confirm shape of the sheet.
- **Entry edit takes the entry id and the full desired line set.** It diffs against the existing rows: changed quantities patch by the difference, new lines insert, dropped lines delete and reverse their delta. Delivery edits also accept a `supplierId` (including clearing it). Sale entries reject edits through this path — they are edited from the Register.
- **Entry delete cascades** to every `stockMovements` row under the header, each reversing its own signed delta, then removes the header. An entry whose lines are all removed on save is deleted through this same path.
- **A projected total is computed per product from the *net* delta across the whole entry**, since one entry can touch the same product on more than one line.

### Sale-total reads

`sales.listForCustomer` and the utang balance computation in `customers` currently sum `saleItems` via the `by_sale` index. Both move to summing `stockMovements` via `by_refId`, filtered to `type: "sale"`, using `quantity * unitPriceAtSale` — noting `quantity` is now negative, so the total is the absolute value (or the sum negated). Getting this wrong flips every utang balance in the app.

### Negative stock

- **A negative `quantityOnHand` is a legal, displayed state.** `withStatus` gains a third status beside `low`/`ok`. **The negative case must be checked before the `low` case** — a negative total is also `<= threshold` and would otherwise render as merely low.
- **Nothing hard-rejects.** The existing `"Not enough stock of \"X\" to complete this sale"` throw is **deleted outright**, not relaxed. The Register is the worst place in the app to refuse a write: the customer is at the counter and the goods are gone, so a refusal buys an unrecorded sale and a permanently wrong utang balance.
- **One uniform rule replaces it: warn, take one confirm, never block.** Identical in the Register checkout sheet and the logging sheet; applies to sale create, pull-out create, entry edit and entry delete. Pull-outs get no lighter treatment — the warning never blocks anyway, so exempting them only removes the typo check.
- **The warning names the actual count** ("only 3 on hand"), not the fact of a shortfall. "Not enough stock" is exactly what was deleted for being useless at the counter.
- **Delete folds its warning into the existing two-tap confirm** ("3 products will go negative") rather than stacking a second dialog. Two dialogs for one tap is how a phone user learns to tap through confirms without reading them.
- **Server backstop: `allowNegative: v.optional(v.boolean())`, per mutation call, not per line.** One confirm gesture = one save = one flag. The warn/confirm computation is necessarily client-side (a Convex mutation cannot ask mid-flight), but without the flag a negative-driving write throws. This is the one place the "a human looked at this" fact is recorded server-side, and it is what stops a future script or second surface from driving stock negative with nobody warned.

### Entity lifecycle

Two rules govern everything:

> **Gate the irreversible action, never the reversible one.**
> **Lifecycle filters selection surfaces, never arithmetic.**

- **Uniform two-state model** (`archivedAt` + `deletedAt`, absent means active) on `products`, `customers` and `suppliers` — no per-entity trimming. Inline create in a fast phone sheet generates typos on all three (the Register's customer picker, the delivery sheet's "+ Add as new product", the supplier picker), so all three earn the same remedy. Per-entity variation lives in the **gates**, not in which states exist.
- **Archive** is reversible and user-facing; **delete** is one-way in the UI and hidden from every list, soft *only* as a referential-integrity mechanism so history keeps rendering names. Neither state is selectable anywhere. Both keep rendering their name on past entries.
- **Delete requires archive first, on every entity** — in addition to any entity-specific gate. Delete therefore never renders beside an active row, and the destructive gesture is inherently two-step and reversible up to the last tap. This is what makes "archive is never gated" safe.
- **Archive is never gated.** A customer who owes money is precisely the one you want off the main list; a product with stock on hand is likewise archivable.
- **Delete gates:** customers blocked while balance ≠ 0 in either direction (an overpayment is still money), message naming the amount; products blocked while `quantityOnHand !== 0` including negative (a deleted-while-negative product is an unreconcilable cache row with no UI left to repair it), message naming the count and the escape; suppliers no extra gate, since `supplierId` is optional and a dangling ref has a legal absent representation. **No gate on ledger history anywhere.**
- **Archiving a product freezes stock, never blocks it.** `quantityOnHand` and every movement row are untouched — archive changes visibility, never arithmetic, so the invariant gets no second way to break. A non-zero count warns naming the count, one confirm, never blocks — deliberately the same warn/confirm shape as the negative-stock rule, so the app has one pattern. **Archived products drop out of low-stock status**, which is the actual reason to archive one.
- **Enforcement seam:** `list` takes `include: "active" | "withArchived"`, defaulting to active; **no argument on any query ever returns soft-deleted rows** (archive is a view you can switch to, delete is not); `get` resolves any row regardless of state and returns the lifecycle fields so callers can badge it. That one rule covers every "excluded from search, included by id" case — the ledger rendering a deleted product's name, a past delivery rendering an archived supplier, a deep-linked detail page. Filtering is **server-side in the handlers**, via a shared lifecycle module (`isActive` / `filterLifecycle`) rather than the predicate retyped in six places.
- **Every gate is checked server-side in the mutation**, not only in the UI — same reasoning as `allowNegative`: the disabled button is an affordance, the throw is the guarantee. The delete check is two conditions (archived **and** the entity gate).
- **The picker exception needs no third list mode**: a picker renders `list` (active) plus a `get` on the currently-selected id, merged in the component and flagged as archived. Typing an archived entity's exact name offers "+ Add as new" and creates a second active row rather than resurrecting the old one — resurrection-by-name-collision is too clever for a widget used mid-log.
- **New mutations required:** `customers.remove` (does not exist today) as a soft delete, plus archive/unarchive on all three entities. `products.remove` changes from a hard `ctx.db.delete` to a `deletedAt` patch.

### UI surfaces

- **Movements is a real 4th nav tab** and the **sole logging entry point**. `+ Delivery` / `− Pull-out` sit at its top. This supersedes ticket 03's floating pill pair over the Products grid, which is dropped. Everything else ticket 03 decided survives: the checkout-style bottom sheet, its mechanics, the qty steppers, and the search-and-pick "Add product" field with its "+ Add as new product" option and inline required selling-price field.
- **The logging sheet and the edit sheet are one component.** An optional `focusProductId` drives the highlight and the "also in this entry" marking; a `readOnly` flag covers sale entries. The two prototype copies fold into one.
- **The delivery sheet and the edit sheet share one supplier picker**, following the existing customer-picker pattern, with the archived-but-selected exception — which means it cannot simply filter on the lifecycle fields; it needs the selected id passed in and exempted.
- **Product detail is the per-product ledger:** compact rows (event label, time, context, signed delta, running balance), day headings, newest first, windowed. Context per type — supplier on a delivery, line total on a sale, reason category + notes on a pull-out. **The product form loses its quantity-on-hand input entirely**, replaced by a line pointing at logging.
- **The Movements tab is entry-level:** one row per logged entry (label, time, product count, product names, net signed delta), same day headings and windowing. Filters: *Deliveries & pull-outs* (default), *Deliveries*, *Pull-outs*, and *Include sales* as an opt-in — sales are excluded by default because the Register and the customer profile already surface them.
- **Surface rule for lifecycle actions: an entity with a detail page puts them there; an entity without one uses its list row.** Products → the product detail page (Archive replacing today's hard Delete; when archived, an "Archived" badge plus Unarchive and Delete, Delete **visible but disabled with its reason inline** rather than hidden). Customers → the customer profile, which becomes the customer-update mutation's first caller ever and finally surfaces `notes`. Suppliers → a Suppliers page at `/movements/suppliers`, behind a link on the Movements tab (not a 5th nav tab), modelled on the Customers page with row-tap edit of name and notes.
- **A collapsed Archived section** (count when collapsed) goes at the bottom of the Products list, the Customers list and the Suppliers page — **build it once**. The Customers one carries the archived owed total in its header, which is what dissolves the "hiding a row hides money" worry: the debt renders on its row and sums in the section header, one tap down the same page.
- **Windowing**: both history lists are windowed. Sales dominate the ledger by row count, so the product page list is long from day one.
- **Query shapes the surfaces need**: movements-by-product with a running balance (sum oldest-first, then reverse for display); entries newest-first with their lines joined; an entry total helper; per-type label helpers. The prototype's ledger module on branch `prototype/movement-history-surface` is the reference for these shapes.

### Cutover

There is **no migration**. Both dev and prod hold only the developer's test data, so `saleItems` is **discarded rather than backfilled**, along with `sales` and `payments` — erasing line items alone would leave orphaned sale headers rendering as ₱0 sales and payments with nothing to offset, rendering as *negative* utang. `customers`, `products` and `appSettings` are kept; the catalog is the real asset.

Sequence:

1. Clear `saleItems`, `sales` and `payments` on the **dev** deployment via the Convex dashboard's *Clear table*.
2. Same on the **prod** deployment.
3. Ship **one** deploy carrying the new schema, the rewritten sale create, and the rewritten sale-total reads. No table has rows at deploy time, so there is no half-migrated state and no schema-validation edge case — the two-deploy dance ticket 01 anticipated is unnecessary ceremony with nothing to migrate, and no throwaway migration mutation enters the repo.
4. Run the opening-balance backfill against dev, verify a product's ledger sum equals its `quantityOnHand`, then run it against prod.

The backfill is a one-off `internalMutation` invoked by hand (`npx convex run`), not the migrations component — it never re-runs on a schedule and the table is ~100 rows, not large enough for resumable migration infrastructure. It reads each product's current `quantityOnHand` and writes one `type: "opening"` movement with that value. Because the ledger is empty at that moment, ledger sum == `quantityOnHand` exactly, with nothing to reconcile.

**It is guarded per product**: before inserting, query `by_product` for an existing `opening` row and skip if found. Invoked by hand across two deployments, a double-fire is a plausible slip rather than a theoretical one, and a second `opening` row would silently double the ledger. The per-product guard (rather than a global "bail if any `opening` exists") also means a product added after the first run correctly picks up its opening row later.

**The backfill ignores lifecycle entirely** — it takes every product regardless of archived or deleted state. An archived product with 7 on hand needs its `opening` row exactly as much as an active one, or its cached count has no ledger rows summing to it. A soft-deleted product all the more so: its ledger rows are why delete is soft, and it is the one product with no UI left to repair it. No other backfill is needed: both lifecycle fields are optional with absent meaning active, so every surviving row is correct the moment the schema deploys.

## Testing Decisions

The repo has **no test infrastructure today** — no vitest, no test files, only `dev` / `build` / `lint` scripts. This feature adds one, and only one.

### The seam

**The Convex function boundary**, tested with `convex-test` + vitest against a real in-memory database. Tests call the public query and mutation exports exactly as the UI does, and assert on what comes back out of queries and on what subsequent queries report. Nothing imports a handler's internals, and no helper is tested in isolation unless it is a public export.

This is the highest available seam that still sees the invariant. Every decision in this spec — signed-delta arithmetic, cache == ledger-sum, the `allowNegative` backstop, the archive/delete gates, the `list`-vs-`get` lifecycle contract, the sale-total rewrite, the backfill's idempotency — is observable there, because all of them are enforced server-side by design. The UI is a second implementation of the warn/confirm affordance, not the guarantee.

### What makes a good test here

- **Assert external behaviour, never internals.** "After logging a delivery of 5, the product reads 25" — not "the mutation called `db.patch` once."
- **Set up through the same public mutations wherever possible**, so a test that passes is evidence the flow works end to end, not evidence of a hand-built fixture.
- **The load-bearing assertion for most ledger tests is the invariant**: after any sequence of creates, edits and deletes, a product's `quantityOnHand` equals the sum of its `stockMovements` rows. Write it as a shared assertion helper and reach for it constantly — it is the one property the whole design exists to protect.
- **Test the boundary conditions the decisions actually turn on**, not coverage for its own sake: negative from either direction on an edit, the same product on two lines of one entry, the last line removed on save, an `other` pull-out with no notes, delete without archive first, a picker's selected-but-archived id.

### Modules under test

- **Ledger writes** — sale create, delivery create, pull-out create, entry edit, entry delete. Signed deltas, cascade on delete, the net-per-product computation across an entry, the `other`-requires-notes validator, the fixed reason-category set.
- **Negative stock** — every write path rejects without `allowNegative` when it would drive a product negative, and succeeds with it; the third status is returned and takes precedence over `low`; the previous hard rejection is gone.
- **Lifecycle** — `list` defaults to active, `withArchived` includes archived and **never** soft-deleted, `get` resolves any state; archive is never gated; delete throws unless archived and the entity gate passes (balance ≠ 0 for customers, non-zero count for products, archive-only for suppliers); archived products leave low-stock status; archiving with stock leaves the count and movements untouched.
- **Sale totals** — the rewritten customer balance and sale history derive the same numbers from `stockMovements` that they used to from `saleItems`. Given this is the path that silently flips every utang balance if the sign is wrong, it deserves an explicit test with a mixed cash/utang history and a payment.
- **The opening-balance backfill** — writes one row per product matching its cached count, is a no-op on a second run, picks up a product added between runs, and includes archived and soft-deleted products.

### Prior art

None in this repo — this is the first test file. `convex-test` is the Convex-native harness for exactly this seam; follow its standard setup (a `convexTest(schema)` instance per test, `t.mutation(api.x.y, args)` / `t.query(api.x.y, args)`), and add `test` / `test:watch` scripts alongside the existing `lint`. Keep the suite in the `app/convex` tree next to the functions it exercises, so the seam is visible from the code that owns it.

### Explicitly not tested

Component and end-to-end tests. The sheets, the pickers, the running-balance rendering, the day headings, the windowing and the warn/confirm dialogs are verified by hand — they were already validated by the eight prototyped variants across tickets 03 and 05, and standing up a component or browser harness for them is a larger investment than this feature warrants. The consequence is stated plainly: **the client-side half of the warn/confirm has no automated guard**; the server backstop is what is actually tested.

## Out of Scope

- **Reporting and analytics on the ledger** — total delivered or pulled out over a period, shrinkage by reason category, supplier spend. The ledger is the substrate that makes these possible and the reason category exists partly to enable them, but nothing here builds a report. This extends the "reporting beyond daily sales total" fog already on the map.
- **Editing sales from the movements surfaces.** Sale entries are visible and read-only; the Register remains the only place a sale changes. Ledger history does not gain a sale editor.
- **Editing opening-balance rows.** They are visible and immutable, with no header entry to open.
- **Backfilling historical sales into the ledger.** The opening balance is the deliberate substitute; pre-launch history is not reconstructed.
- **A cost price on deliveries, or any purchase-cost or margin tracking.** Deliveries record quantity and supplier only.
- **Supplier contact fields.** `name` + `notes`, mirroring customers; no phone, address or contact column.
- **A per-supplier delivery history page.** Suppliers are managed, not browsed; deliveries are found on the Movements tab.
- **A recycle bin or undelete UI.** Soft delete is a referential-integrity mechanism, not an in-app trash can; there is no route back from deleted.
- **Resurrecting an archived entity by name collision** in a picker. Unarchive from the management surface instead.
- **A settings surface.** `lowStockThreshold` still has no UI and does not get one here.
- **Multi-user concerns** — auth, per-user attribution on a movement, "who logged this". Movements record what and when, not who.
- **A fifth nav tab.** Suppliers lives behind a link on Movements; the nav bar stops at four.
- **An index on the lifecycle fields**, and any broader indexing or performance work on the full-scan queries. At ~100 SKUs this is deliberate.

## Further Notes

- **Read the tickets for the reasoning, not just the rulings.** Several decisions here are counter-intuitive and were reached against an initial recommendation — deleting the not-enough-stock guard, keeping the server-side `allowNegative` backstop, requiring archive before delete. The tickets record why each alternative lost, which matters when the build session hits a case the spec does not name.
- **Two amendments to be careful of.** Ticket 01 locked `deliveries.supplierId` as required and ticket 07 made it optional; ticket 03 put the logging entry point on the Products page and ticket 05 moved it to the Movements tab. Both tickets carry notes about their own supersession, but the schema block and the surface section in this spec are the current truth.
- **Ordering that matters.** The negative check must precede the low check in the status helper. The sale-total rewrite must handle the now-negative `quantity` sign. The cutover clears tables *before* the single deploy, and the backfill runs *after* it.
- **A known rough edge, expected rather than accidental.** The product delete gate is not free the way the customer one is: a typo product born from "+ Add as new product" arrives *with* stock, because the delivery line that created it put units on it. Cleanup composes — reopen the entry, re-point or drop the line, the ghost falls to 0, archive, delete. Build sessions should expect to walk that path rather than treat it as a bug.
- **One duplicate-name check to confirm.** The product detail page queries the product list for what looks like a duplicate-name check. A collision against an *archived* product is a real case (archive "Coke 1.5L", later re-add it), so it probably wants `withArchived` and a warning rather than a block — worth a moment's thought during the build rather than a silent default.
- **The prototypes are the visual reference, not the code.** Eight variants across two throwaway branches (`prototype/stock-movements-logging-flow`, `prototype/movement-history-surface`) back the surface decisions. Neither is merged; both are the primary source for how these screens should look and behave.
- **Not everything is stated because much of it is inherited.** This feature sits on the existing app's conventions — the Register checkout sheet, the customer picker, the nav chrome, the phone-primary layout, the Cebuano/Messenger register of the client-facing copy. Where this spec says "like the checkout sheet," it means it fairly literally: the transferred muscle memory is the justification for the whole logging design.
