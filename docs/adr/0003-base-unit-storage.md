# Stock held in Base units, with a per-row ratio snapshot and round-on-read

**Status:** accepted

A product's stock is counted in a single **Base unit**, and a stock movement stores the Unit label, a signed Unit quantity, and a snapshot of that Unit's Base equivalent at the time — *not* the resulting Base amount. The Base amount is derived on read as `Math.round(unitQuantity × baseEquivalent)`. We chose this over storing the computed Base amount because storing it would create two representations of one fact with nothing to adjudicate a disagreement, and because deriving it from the *live* product config instead of a snapshot would let a later redefinition of a Unit silently rewrite history.

## Considered options

**Store the computed Base amount on the row.** Rejected. The obvious shape, and the one someone will propose again. It is redundant with `unitQuantity × baseEquivalent`, so a bug in any one write path desynchronises them permanently. The performance argument for it does not apply here: Convex has no engine-side aggregation, so every total is already a `.collect()` followed by a JS `reduce` — the rows are in memory either way, and deriving costs one multiply inside a loop that runs regardless. Contrast `products.quantityOnHand`, which *is* deliberately denormalised and earns it by collapsing an unbounded, history-length `.collect()` into a single field read. A per-row copy collapses nothing.

**Derive against the product's current Base equivalent, with no snapshot.** Rejected. Fully normalised, but the Base amount then depends on mutable config. Redefine a tray from 30 pieces to 12 and every historical egg movement retroactively changes size. The snapshot is the same reasoning `unitPriceAtSale` already embodies: a mutable product-level reference value must be frozen onto the row that used it.

**Make everything integral and forbid decimal quantities.** Rejected. It would have removed the need for rounding, with fractional selling modelled as finer named Units. Rejected on fact, not principle: the store sells rice by the kilo in amounts the customer chooses at the counter.

## Consequences

- Rounding on read is what keeps decimals safe. `1.7 × 1000` evaluates to `1700.0000000000002`, and since the multiply now happens on *every* read rather than once at write, that noise would be re-summed into `quantityOnHand` — a cached figure rewritten in place — until stock reads `299.99999999999994` and the low-stock pill flickers for no visible reason. Rounding to a whole Base unit makes each row yield the same integer forever, so the derived value is stable without being stored.
- This is only lossless under a modelling rule that belongs with it: **the Base unit must be fine enough that everything the store actually transacts is a whole number of it.** Rice is based in grams, not kilos, so 1.7 kg lands as exactly 1700 g. Choosing kilos as the Base unit would push real quantities below the resolution of the ledger. Selling 0.333 kg discards a third of a milligram, which nobody can weigh.
- Raw Base-unit figures can read oddly to a human (rice on hand as `45000`), which is what the per-product remainder reading exists to solve at the display layer — see the project description.
- The Unit *label* is snapshotted onto the row alongside the ratio, so removing a Unit from a product cannot orphan the history that used it.
