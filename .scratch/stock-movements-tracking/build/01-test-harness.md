# 01 — Test harness at the Convex function boundary

**What to build:** a working test seam so every ticket after this one can prove its behaviour instead of asserting it by hand. Tests call public Convex queries and mutations exactly as the UI does, against a real in-memory database, and assert on what comes back out.

The one assertion this feature exists to protect gets a shared helper here: for a given product, `quantityOnHand` equals the sum of its `stockMovements` rows. Every later ticket reaches for it.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] `vitest` and `convex-test` are installed and a `convexTest(schema)` instance can be created per test
- [ ] `test` and `test:watch` scripts sit alongside the existing `lint` script
- [ ] The suite lives in the `app/convex` tree, next to the functions it exercises
- [ ] A shared assertion helper asserts cache == ledger-sum for a product, and is exported for reuse
- [ ] One smoke test drives an existing public mutation and reads the result back through a public query, proving the harness sees the real database
- [ ] No test imports a handler's internals; nothing is tested in isolation unless it is a public export
