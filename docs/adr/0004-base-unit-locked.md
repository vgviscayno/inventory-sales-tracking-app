# A product's Base unit is locked once it has movements

**Status:** accepted

Which Unit a product is counted in can be changed freely until the product has its first stock movement, and never afterwards. A product whose Base unit turns out to be wrong is **archived and recreated** rather than converted. We chose this because reassigning the Base unit is a data migration wearing the costume of an edit button, and because the archive lifecycle needed to support the alternative already exists.

It is not a simple edit because `quantityOnHand` and `lowStockThreshold` are bare numbers denominated in the Base unit, with nothing on them recording which Unit that was. Flip eggs from piece to tray and `quantityOnHand: 300` stops meaning 300 pieces and starts meaning 300 trays — a thirtyfold inflation of stock, with no error raised anywhere and no way to detect it after the fact. Every historical row's snapshotted ratio (ADR-0003) was also taken against the *old* base, so deriving Base amounts would sum two incompatible denominations into one figure. Doing it correctly means rewriting `quantityOnHand`, rewriting `lowStockThreshold`, and rewriting every movement row's snapshot — a backfill, executed transactionally, with a rollback story. That is not something to hang off a form field.

## Considered options

**Allow reassignment with a real conversion behind it.** Rejected. Correct but expensive, and it buys an operation the store will perform approximately never. The cost is not the one-off implementation — it is that every future change to stock storage has to keep the conversion path correct.

**Allow reassignment and simply reinterpret the numbers.** Rejected. Silent, undetectable data corruption.

## Consequences

- The escape hatch costs nothing new to build: product archival already exists, and archive-and-recreate is strictly better than conversion for auditing. History stays intact and unambiguous under the old product, denominated the way it always was, while the replacement starts clean in the right Base unit. Nothing has to be reinterpreted, so nothing can be reinterpreted wrongly.
- The real cost lands at product creation, not later: a Base unit chosen carelessly is cheap to fix only until the first movement. This is why new products are **not** seeded with a plausible-looking default such as `pc` — a label that reads like a real answer will quietly stick to a product that should have been based in grams. It also raises the stakes on ADR-0003's fineness rule, since "the Base unit was too coarse" is discovered late and fixed only by recreation.
- Two rules travel with this one, for the same reason: a product must have a Base unit at all times, and the Base unit can never be removed from a product's Unit list. Non-Base Units may be removed freely.
