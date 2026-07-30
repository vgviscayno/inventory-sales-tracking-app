Type: grilling
Status: resolved
Blocked by: 03

## Question

How do users find a specific product among 100+ SKUs — plain text search, category-based filtering, or both?

The client's own answers don't mention categories or organization scheme for her products, only that there are "more than 100" of them (a rough estimate). Consider:
- Plain text search on product name alone may be sufficient if products have distinct, memorable names.
- If products naturally group (e.g. by type, brand, or shelf), category filters could help, but that requires the client to assign categories — an extra step she hasn't asked for.
- Whether this is a client-facing decision (does she *want* categories?) or purely an implementation detail decided from the product entity shape settled in ticket 03.

Resolve with the product entity from ticket 03 in mind (zoom into it as needed) — this ticket decides the retrieval mechanism, not the product schema itself.

## Answer

Plain text search only, no category system. The client never mentioned categories, and the product entity (ticket 03) has no category field — adding one would mean speculatively building a feature she never asked for, plus forcing her to categorize 100+ existing products for no requested benefit. If real pain shows up post-launch, categories can be added then.

Matching: substring, case-insensitive against product name (e.g. "cola" matches "Coca-Cola 1L"). Simple to implement as a Convex query, and matches default user expectations for a search box — no fuzzy/typo-tolerant matching for v1.

Status-based filters (e.g. a "show low-stock only" toggle using the low/ok status from ticket 04) are explicitly out of this ticket's scope — it's a separate UI/reporting concern, not part of the retrieval mechanism this ticket decides.
