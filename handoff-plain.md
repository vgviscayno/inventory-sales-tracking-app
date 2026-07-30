# Handoff: The Client's Store Inventory & Sales Tracking App

> Translator's note: This is a literal, gloss-in-place version of `handoff.md`. The structure and technical content are unchanged; only the Cebuano/Bisaya words have been replaced or annotated with their English equivalents. Glosses appear in [square brackets].
>
> - **Bisaya** = Visayan, i.e. the Cebuano language
> - **suki** = a regular/loyal repeat customer
> - **utang** = debt / money owed (a purchase made on credit, to be paid later)
> - **ate** = older sister (an honorific for an older woman)
> - **Choi** = the client's son (a personal name/nickname)
> - **Karon** = NOT a name. The Cebuano word *karon* means "now / today." The original `handoff.md` mistakenly treats it as the client's name; every "Karon" reference below is therefore a mistranslation and the client's actual name is unknown/TBD.

## Context
The user (acting as developer/consultant) is scoping and building an inventory + sales tracking app for a **store owner client** (actual name unknown — see translator's note). Communication with the client happens in **Cebuano [the Visayan language]**. This project has two prior conversations, summarized below.

## Where things stand

### 1. Requirements discovery (earlier session)
- The user asked whether "what type of data do you want to see" was a good discovery question for the client.
- Claude advised it was too abstract for a non-technical business owner and recommended asking about current workflows, pain points, number of users, and what decisions the owner wants the system to support.
- Claude drafted a Cebuano-language discovery question, then reformatted it into 4 short bullet-point questions suitable for sending via **Facebook Messenger** (the user's preferred client-communication channel).
- Discovery bullets covered: current tracking method, main frustrations, number of users, desired at-a-glance info.

### 2. Requirements analysis from the client's answers (most recent session)
The client replied to the discovery questions (in Cebuano). Key findings from her responses:
- **No existing inventory system** in place.
- Inability to trace stock and sales is causing management difficulties.
- She wants to see: **current stock levels**, **daily total sales**, and a way to track **credit purchases from regular customers ("suki utang" [regular-customer debt: goods taken on credit by loyal repeat customers])** — critically, utang [on-credit] purchases should also **deduct from inventory at point of sale**, even though payment happens later.
- Claude flagged utang [credit-debt] tracking as the most complex requirement: it requires **separating inventory deduction (triggered at sale) from payment status tracking** (paid vs. owed).
- Claude built a full requirements questionnaire, then trimmed it to **7 essential follow-up questions**, covering:
  1. Who will use the app (staff vs. owner only)
  2. Approximate number of product types/SKUs
  3. Whether low-stock alerts are wanted
  4. Utang [credit] tracking preference: running balance per customer vs. per-transaction ledger
  5. Whether partial payments need to be supported
  6. Device type (phone/tablet/desktop)
  7. Internet availability / need for offline support

### 3. The client's answers to the 7 follow-up questions (this session, 2026-07-27)
The client has now answered all 7 questions (in Cebuano). Translated/interpreted:

1. **Users:** 2 people will use the app — the client and her older sister ("ate" [older sister]).
2. **Number of products:** Many — "more than 100" SKUs (rough estimate, not exact).
3. **Low-stock alerts:** Yes, wanted — she wants to be aware whether a product is still well-stocked or running low.
4. **Utang [credit] tracking:** Yes — a running total balance per customer is fine (not per-transaction ledger detail).
5. **Partial payments:** Yes, needs to be supported.
6. **Device:** Phone primarily. She also mentioned there's a tablet available (belonging to "Choi" [the client's son]) that isn't currently being used and could potentially be used for the app. **Needs clarification**: whether the tablet should be treated as a second device/screen for the app (e.g., for her sister) or is just an incidental mention.
7. **Internet/offline:** Internet is normally available, but she'd prefer the app to still work offline when needed.

### Design implications from these answers
- **Multi-user (2 accounts)**, likely without complex role/permission separation — just the client + ate [her older sister], probably both with similar access.
- With **100+ SKUs**, the product list needs decent search/filter, not just a flat list.
- Low-stock alerts should be **simple status indicators** (e.g., "low / ok"), not necessarily precise numeric thresholds unless specified later.
- Utang [customer credit] can be modeled as a **running balance per customer** (simpler than a full per-transaction ledger), while still deducting stock at time of sale (per the original complexity flag).
- Partial payments mean the utang [credit] balance needs to support **incremental paydown**, not just paid/unpaid status.
- **Offline-first (or offline-tolerant) design** is now a confirmed requirement, not just a nice-to-have — this affects tech stack choice (e.g., local storage/sync vs. purely server-based).
- The **tablet mention is an open thread** — worth a quick follow-up to clarify if it changes the multi-device design.

### Remaining open gap
- Clarify the **tablet ("Choi" [the client's son])** detail from answer #6 — is it meant to be a second device for the app, and if so, does that change any assumptions about simultaneous multi-user access?

## Suggested next steps
- Send one quick clarifying question to the client about the tablet/device setup.
- Move from requirements to a **data model / feature spec**: products (with search/filter for 100+ SKUs), sales transactions, utang [customer credit] running-balance-per-customer with partial payment support, and low-stock status flags.
- Decide on tech stack with **offline support** as a hard requirement (e.g., local-first storage with sync, or a PWA with offline caching).
- Keep client-facing communication in Cebuano and formatted for Messenger (short bullets, non-overwhelming), matching the user's established preference.

## Suggested skills to invoke
- None of the standard document-creation skills (docx/pptx/xlsx/pdf) appear needed yet — this is still in the requirements-gathering phase.
- If the next session moves into building the actual app (e.g., a spreadsheet-based prototype or a web app mockup), consider:
  - `xlsx` skill if a prototype/mock data tracker is requested as a spreadsheet.
  - `frontend-design` skill if a UI mockup or working prototype (web app) is requested.

## Notes
- No sensitive personal data (API keys, passwords) appeared in either conversation. The client's actual name is not established (the earlier "Karon" was a mistranslation of the Cebuano word for "now"); treat this as normal business context, not sensitive PII requiring redaction.
