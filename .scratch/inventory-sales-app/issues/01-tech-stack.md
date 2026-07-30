Type: grilling
Status: resolved

## Question

What's the tech stack for the app — frontend framework, backend/API approach, database, and hosting target?

Constraints to weigh:
- Online-only for v1 (no offline/local-first data layer needed now, but don't pick something that would require a rewrite to add it later — see map Notes).
- Small scale: 2 users, ~100+ SKU rows, low transaction volume for a single small store. Does not need to be built for scale.
- Phone-primary usage, responsive web (no native app, no PWA install for now).
- The user (developer/consultant) is building and likely maintaining this solo — factor in their familiarity/preferences alongside technical fit.
- Budget: client is a small store owner — hosting costs should be minimal or free-tier where reasonable.

## Answer

- **Frontend:** Next.js (React), deployed to **Vercel** free tier.
- **Backend + database: Convex.** Convex's reactive queries/mutations replace both a traditional relational database and a separate API layer (no Next.js Server Actions or standalone REST/GraphQL service needed) — Convex mutations own sale-time inventory deduction and utang running-balance/partial-payment updates, and Convex's realtime queries push UI updates automatically.
- No offline/local-first layer for v1, consistent with the map's scope — Convex's client is online-first but this isn't a rewrite-blocking choice if offline is revisited later.
- Driven primarily by the solo developer/consultant's existing JS/TS comfort, and a preference for Convex over a Postgres/Supabase setup to avoid hand-writing the API layer.
