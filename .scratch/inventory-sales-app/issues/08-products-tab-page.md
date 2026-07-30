Type: task
Status: open
Blocked by: 03, 04

## Question

Build a Products tab/page in the app so products can actually be added, edited, and removed — right now `convex/products.ts` already has working `create`/`update`/`remove` mutations, but no UI calls them. The Register page (`src/app/page.tsx`) only lists/sells existing products; there's no way to get a new product into the system at all.

Scope: single-product add/edit/delete, following the Product shape locked in the core data model (ticket 03) — name, sellingPrice, quantityOnHand, optional lowStockThreshold override. Add a "Products" entry to `Nav.tsx` alongside Register/Customers.

Bulk-adding many products at once is explicitly **not** part of this ticket — see the map's Not yet specified section; that needs its own design pass before it can be scoped.

## Answer

