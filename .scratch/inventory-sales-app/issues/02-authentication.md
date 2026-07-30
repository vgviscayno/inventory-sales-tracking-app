Type: grilling
Status: resolved

## Question

How do the client and her sister ("ate") log in / identify themselves in the app?

Both users have similar access — no complex roles are expected (per handoff-plain.md). Options span a spectrum from "no auth at all, just open the site" to "separate named accounts with passwords." Consider:
- Does the app need to know *which* of the two people made a given sale/edit, or is that irrelevant to the client's stated needs (stock levels, daily sales total, utang tracking)?
- Low-friction is important — non-technical users on a phone, in a small store, likely mid-transaction with a real customer waiting.
- Any auth choice should stay compatible with the "no roles/permissions" decision already made — this ticket is about identification/access, not authorization tiers.

## Answer

- **No per-user identity or attribution.** The client never asked to know who made a given sale/edit, and it's irrelevant to stock levels, daily sales total, or utang tracking. No user accounts, no Convex Auth/Clerk.
- **Single shared passcode gates the whole app.** One PIN/passphrase, shared between the client and her sister, protects the app from being wide open to anyone who finds the URL — but stops short of individual accounts, matching the no-roles decision.
- **Implementation:** a server-side check (e.g. a Convex function or Next.js middleware) comparing the entered passcode against a stored secret, setting a session cookie on success. No auth library needed.
- **Session persistence:** long-lived/persistent — once entered on a device (phone or tablet), stays logged in indefinitely until explicit logout or the browser data is cleared. Avoids interrupting a mid-transaction moment with a real customer waiting.
