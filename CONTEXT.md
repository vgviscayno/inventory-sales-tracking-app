# Inventory & Sales Tracking

## Language

### Domain vocabulary

**Unit**:
A way a product can be counted and transacted — `piece`, `tray`, `sack`. Every product has at least one, and may have several: eggs are handled both as pieces and as trays. A Unit's label is its singular form, and is not necessarily what reaches the screen: wherever a label stands next to a count it is inflected to agree with it, so a label recorded as `tray` reads "1 tray" and "3 trays". Labels that take no English plural are exempt and stand unchanged at every count — measures written as abbreviations, and Tagalog nouns, which do not inflect for number at all, so `2 kg` and `3 sako`.
_Avoid_: measure, UOM, packaging

**Base unit**:
The single Unit a product's stock is counted in. Every quantity the app holds about that product's stock — how much is on hand, the threshold at which it reads as low — is expressed in it. Which Unit plays this role is a decision recorded per product, not inferred from the Units themselves.
_Avoid_: piece (that is one product's Base unit, not the concept), smallest unit, primary unit

**Base equivalent**:
How many Base units one of a given Unit amounts to — 1 for the Base unit itself, 30 for an egg tray. It belongs to the pairing of a product and a Unit: a tray of eggs and a tray of tomatoes need not agree. A product's Base unit is expected to be fine enough that everything the store actually transacts comes to a whole number of it — rice counted in grams rather than kilos, so that selling 1.7 kg lands exactly. Quantities are allowed to be decimal where the store genuinely sells that way; what the Base unit's fineness buys is that the stock ledger itself never has to hold a fraction.
_Avoid_: conversion factor (silent about direction), multiplier, ratio

**Default unit**:
The Unit a product leads with — the one its price is quoted in on listings, and the one preselected when someone logs a movement against it. A separate decision from the Base unit, because what a product is counted in and what it usually changes hands in need not be the same. Where no choice is recorded, the Base unit stands in. It is also how the shop-wide low-stock threshold stays meaningful across a catalogue that counts different products differently: that one shared number is taken as a count of each product's Default unit, so it says "warn me under ten of however I usually sell it" rather than ten of ten different things. A threshold set on an individual product is still held in that product's Base unit.
_Avoid_: primary unit, main unit (both blur into Base unit)

**Remainder reading**:
Reading a stock figure against a Reading ladder — a whole count of each Denomination on the ladder in turn, with what is left over falling to the next: "3 cases, 5 pcs" rather than "1085 pcs". A Denomination that comes to zero is not spoken. Whether a product's figures read this way is a per-product choice, and it applies to all of them at once, so a product never mixes the two readings across a screen. It is a way of reading a quantity, never a way of holding one.
_Avoid_: breakdown, mixed units, cascade

**Reading ladder**:
The Denominations a product's stock is spelled out in, ordered by descending Base equivalent and always ending at its Base unit. It is chosen per product from that product's own Units; no ladder means the stock reads as a plain Base-unit figure. The Base unit is on the ladder whether or not it was chosen, because it is the only Denomination fine enough to hold whatever the coarser ones leave behind. Nothing requires the Denominations to divide into each other — a sack of 100 pieces and a bundle of 12 sit on one ladder quite happily, and the reading stays exact — so a bundle count of 8 does not mean "nearly a sack".
_Avoid_: unit list, hierarchy, conversion chain (all imply the Denominations nest, which they need not)

**Denomination**:
A Unit a product's stock is read in — one entry on that product's Reading ladder. Each Denomination takes its whole count of a figure before what is left falls to the next, and the Base unit is the last of them whether or not it was chosen. A Unit is a Denomination only against a particular product's ladder: `tray` is an ordinary Unit on a product whose stock does not read that way. Denominations need not divide into each other, the way a 20-peso note and a 5-peso coin do not.
_Avoid_: rung (the ladder's own jargon, which nobody in the shop would say), tier, level, step (all imply the Denominations nest)

**Unit quantity**:
The amount recorded against a movement, expressed in the Unit the person actually chose — "2 trays" is a Unit quantity of 2 against the Unit `tray`. What the stock ledger reasons about is the Base-unit amount this comes to; the Unit and Unit quantity are kept so the movement can be read back the way it was entered.
_Avoid_: quantity (ambiguous — say whether it is in Base units or in a chosen Unit)

### Process vocabulary

Git-workflow terms, not domain terms — kept here because `docs/agents/domain.md` names `CONTEXT.md` as the one glossary this repo has. See `docs/git-workflow.md` for the full workflow these terms describe.

**Project branch**:
The long-lived integration branch for a Linear project whose tickets carry the `build` label, `project/<short-slug>`. Build work accumulates here and lands on `dev` once, whole, when every build ticket is done.
_Avoid_: feature branch, integration branch (on its own — ambiguous with `dev`)

**Ticket branch**:
The short-lived branch for one build ticket, cut from the project branch tip and squash-merged back into it.
_Avoid_: feature branch, work branch

**Build ticket**:
A Linear issue carrying the `build` label — one slice of a project delivered via a ticket branch.
_Avoid_: task, story

**Discovery ticket**:
A `prototype` or `grilling` ticket that answers a design question with throwaway code. Never merged back — the answer lands in Linear as a comment; the code is deleted when the ticket is Done.
_Avoid_: spike, exploration ticket

**Escape hatch**:
The path for non-feature work (repo docs, tooling, unrelated bug fixes): branch off `dev`, land on `dev` directly, never touching a project branch. Keeps unrelated work from being held hostage for the length of a build project.
_Avoid_: fast path, side branch
