Type: grilling
Status: resolved

## Question

What's the core data model — the entities and relationships for products, sales transactions, customers, and utang (credit) balances?

Known constraints from handoff-plain.md:
- Products: 100+ SKUs, need search/filter (search/filter *approach* is a separate ticket — this one just needs to settle the product entity's shape, e.g. name, SKU/code, price, quantity-on-hand, and whatever low-stock status needs — see the low-stock-threshold ticket for the exact mechanism).
- Sales: a sale deducts inventory immediately at the point of sale, *regardless* of payment status (cash or utang).
- Utang (customer credit): tracked as a running balance per customer (not a full per-transaction ledger) — but must support partial payments, which means *something* records payment events against that balance even though the balance itself is the primary read model. The exact recording mechanism for a paydown is a separate ticket (05) — this ticket should settle the customer entity and how it relates to sales and to the running balance.
- Two users, no per-user attribution requirement established yet (depends on the authentication ticket, 02) — if authentication settles that sales/payments should be attributed to a user, reflect that in the model; if not, omit it.

Produce the entities, their key fields, and the relationships between them (product ↔ sale, sale ↔ customer, customer ↔ utang balance).

## Answer

**Entities:**

- **Product** — `name`, `sellingPrice`, `quantityOnHand` (mutable, decremented in the same transaction as the sale). No SKU/code field, no category, no variants (single-SKU-single-unit assumed for v1 — client never mentioned variants; revisit if a client follow-up surfaces them), no cost price (client only asked for stock levels/daily sales/utang, not margin). Low-stock status/threshold mechanism is left to ticket 04 — it may add a field here, not decided by this ticket.
- **Customer** — `name`, `notes` (optional free text for informal staff context). No phone, no login/account (no per-user attribution per ticket 02).
- **Sale** — `customerId` (optional — identifies who bought it; present even for a cash sale to a known suki is fine, it's incidental and drives no behavior), `paymentMethod` (`"cash" | "utang"` — `"utang"` requires `customerId` to be present, since credit can't be extended anonymously), `createdAt`. `totalAmount` is *not* stored — computed by summing its `SaleItem` lines.
- **SaleItem** — `saleId`, `productId`, `quantity`, `unitPriceAtSale` (snapshot at time of sale, so later product price changes don't retroactively alter historical sale amounts).
- **Payment** — `customerId`, `amount`, `paidAt` — the paydown record against a customer's utang. Established as its own entity now because the balance is computed from it; exact allocation/partial-payment semantics (e.g. how a paydown applies across multiple outstanding sales) are ticket 05's job.

**Relationships:**

- `Product` 1—* `SaleItem`; `Sale` 1—* `SaleItem` (a sale is a basket of one or more line items, not one-product-per-sale).
- `Sale` *—1 `Customer` (optional).
- `Payment` *—1 `Customer`.
- A customer's utang balance is **not a stored field** — it's computed on read: sum of `Sale.totalAmount` where `paymentMethod = "utang"` for that customer, minus the sum of that customer's `Payment.amount`s. Mirrors the "computed over stored/denormalized" direction chosen for `Sale.totalAmount` as well.

Inventory (`quantityOnHand`) remains a stored mutable field (not derived from a movements ledger) — decremented directly at sale time, since a movements/audit-trail ledger was never requested and Convex mutations make the decrement-plus-sale-insert atomic.
