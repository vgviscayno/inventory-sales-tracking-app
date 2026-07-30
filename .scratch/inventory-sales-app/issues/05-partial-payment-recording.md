Type: grilling
Status: resolved
Blocked by: 03

## Question

How is a partial payment against a customer's utang balance recorded and reflected?

The client wants a running balance per customer (not a per-transaction ledger) but needs partial payments supported (per handoff-plain.md). This creates tension: a pure running-balance model with no history makes it hard to answer "did she pay anything last week?" or correct a mistaken payment entry, but a full ledger is explicitly more detail than the client asked for.

Consider a middle ground: does every payment (full or partial) get its own lightweight record (amount, date) that's summed to produce the running balance the client sees — giving cheap auditability without exposing per-transaction ledger complexity in the UI? Or does the client's request mean literally just an editable running-balance number with no history at all?

This decision directly shapes the customer/utang portion of the data model settled in ticket 03 — resolve with that model in mind (zoom into it as needed).

## Answer

**Payment entity (refines ticket 03's initial shape):** `customerId`, `amount`, `paidAt`, `notes` (optional free text).

- Every payment — full or partial — creates its own lightweight record; the utang balance remains fully computed (sum of utang sales minus sum of payments), never a directly-edited number. Gives cheap "did she pay last week?" auditability without a full per-transaction ledger UI.
- Edit and delete are allowed on payment records, so staff can correct typos or misattributed entries directly — no append-only/immutable audit trail requirement exists here.
- No allocation against specific sales — a payment applies to the customer's aggregate balance only, consistent with the running-balance (not per-transaction ledger) model. Allocation-by-sale (e.g. to support future interest/fee computation) is noted as a later-phase concern, not designed now.
- Overpayment is allowed without validation — the computed balance can go negative, read by staff as "customer has credit toward future purchases." No blocking/capping logic at save time.
