# 08 — Negative stock, warned loudly and never blocked

**What to build:** one rule, everywhere. When a write would drive a product below zero, the app **warns her by name and count** ("only 3 on hand"), takes **one confirm**, and never blocks. A negative count is a legal, displayed state carrying a loud badge distinct from low stock — "this count is wrong, recount" must never read as "order more". A negative number is the most useful thing the app can say: it localises the drift to one product.

The existing `Not enough stock of "X" to complete this sale` throw is **deleted outright, not relaxed.** The Register is the worst place in the app to refuse a write — the customer is standing at the counter with the goods in hand, so a refusal buys an unrecorded sale and a permanently wrong utang balance. An unrecorded sale must be impossible to be forced into.

The same warning appears in the Register checkout sheet, the pull-out sheet, an entry edit and an entry delete — one rule to remember rather than two. Pull-outs get no lighter treatment: the warning never blocks anyway, so exempting them only removes the typo check. A **delete** that would drive stock negative says so **inside its existing two-tap confirm** ("3 products will go negative") rather than stacking a second dialog — two dialogs for one tap is how a phone user learns to tap through confirms without reading them.

Underneath, a server backstop: **`allowNegative: v.optional(v.boolean())`, per mutation call, not per line** — one confirm gesture is one save is one flag. The warn/confirm computation is necessarily client-side, since a Convex mutation cannot ask mid-flight; without the flag, a negative-driving write throws. This is the one place the "a human looked at this" fact is recorded server-side, and it is what stops a future script or a second surface from driving stock negative with nobody warned.

**Ordering that matters:** in the status helper, the **negative case must be checked before the low case** — a negative total is also `<= threshold` and would otherwise render as merely low.

The client-side half of the warn/confirm has no automated guard; it is verified by hand. The server backstop is what is tested.

**Blocked by:** 07 — Editing and deleting a logged entry.

**Status:** ready-for-agent

- [ ] The `Not enough stock…` throw is gone from `sales.create`
- [ ] `sales.create`, the pull-out create, the entry edit and the entry delete all accept `allowNegative` and throw without it when the write would drive any product negative
- [ ] Each of those succeeds with `allowNegative: true` and lands the negative count
- [ ] The flag is one argument per call, not per line
- [ ] `withStatus` returns a third status for a negative count, checked **before** the low case, and it is surfaced with its own loud badge distinct from low stock
- [ ] The Register checkout sheet warns naming the product and its actual count, takes one confirm, and never blocks
- [ ] The pull-out sheet shows the identical warning
- [ ] An edit that would drive a product negative warns the same way, from either direction
- [ ] A delete that would drive stock negative folds its warning into the existing two-tap confirm — no second dialog
- [ ] The cache == ledger-sum helper still passes when counts are negative
