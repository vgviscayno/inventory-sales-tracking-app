Type: prototype
Status: resolved
Blocked by: 03, 05

## Question

What does the point-of-sale/utang flow actually look like and feel like to use?

This is the highest-risk interaction in the whole app: a sale must deduct inventory immediately, independent of whether the customer pays now (cash) or takes it on credit (utang) — and if utang, the flow needs to identify the customer and add to her running balance, with room for that balance to later be paid down partially (per ticket 05).

Build a cheap, rough, concrete prototype (via `/prototype`) of this screen/flow — enough to react to, not a polished UI. Cover at minimum:
- Selecting/adding products to a sale (relevant to the search/filter decision in ticket 06, but doesn't need to wait on it — use a reasonable stand-in).
- Choosing cash vs. utang at checkout.
- For utang: selecting or creating the customer, and confirming the sale amount is added to her balance.
- Where a partial payment against an existing balance would happen — is it part of this same flow, or a separate "record payment" screen reached from the customer's profile?

Resolve using the data model (03) and partial-payment mechanics (05) already settled — zoom into those tickets as needed.

## Answer

Prototype built as a standalone, dependency-free HTML file at `prototypes/07-sale-utang-flow.html` (no app scaffold exists yet, so this was built to run on its own rather than mounted in a real route). Three structurally different variants were built and reviewed in-browser:

- **A — Register**: product grid + sticky cart drawer; cash/utang toggle inside the checkout sheet; utang requires picking/creating a customer. Payment recording lives entirely under a separate "Customers" tab — checkout and paying down an existing balance are unrelated actions on unrelated screens.
- **B — Wizard**: guided 3-step flow (Items → Payment → Confirm); if an utang customer with an existing balance is selected, an optional "also collect payment toward old balance now?" box folds directly into the payment step.
- **C — Customer-first**: flips the order — pick who the sale is for (or walk-in cash) before touching products; payment recording is a standalone action from the customer's profile, never surfaced during checkout.

**Decision: Variant A.** Checkout and payment-recording are separate flows, reached from a dedicated Customers tab rather than folded into the point-of-sale screen.

During review, two real bugs were caught and fixed directly in the prototype (not just cosmetic — both affected variants B and C's usability):
1. The floating variant-switcher bar (prototype-only chrome) was wide enough to overlap and block the "Complete Sale" button in variant A's checkout sheet — fixed by capping/truncating the switcher label and padding the sheet.
2. Variant B/C's "Add" button on the product row was forced to `width:100%` by the shared `.ghost-btn` class, squeezing it narrower than its own text inside its flex container — fixed with an explicit `width:auto` override.
3. Variant C's checkout/confirm screen was missing a back button (present on every other screen in that variant) — added.

No production code exists yet to fold this into (destination is a spec, not a built app) — the prototype file itself, plus this decision, is the durable artifact. A future build session should implement the Register layout: product grid/search → cart drawer → cash/utang toggle → customer picker (existing or new) on the sale screen, and a separate Customers list/profile screen carrying balance display, transaction history, and the "Record Payment" action.
