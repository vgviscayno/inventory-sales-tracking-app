# Comments

The house standard for code comments in this repo. It is written down because it was
tacit: six files carry careful domain prose, eighteen carry none, and the style was
being rediscovered or ignored one session at a time.

Two rules decide everything: a comment earns its lines by **non-derivability**, and it
is written in the **ASD-STE100 register**. Everything below is those two rules, their
edges, and worked pairs from real files here.

This document is not itself written in that register. Rationale needs the room, and
rationale is what stops a rule being applied where it does not fit.

## Coverage

In scope: inline `//` comments, module headers, and JSDoc — in `convex/` and `src/`,
tests included.

Out of scope, each for its own reason:

- **Test names.** `docs/agents/domain.md` already governs them, under "Use the
  glossary's vocabulary".
- **Commit messages.** They address humans reading history, not agents reading code.
- **ADR prose.** An ADR argues. Twenty-word declaratives would strip the argument of
  the very thing that makes it persuasive.

Tests are in scope for style and never for additions. Their comments mostly justify
fixture values, which is the strongest writing in the repo. Expect to confirm them and
restyle lightly.

## Non-derivability decides length

A comment may take as many lines as it needs for anything you cannot recover from the
code, the types, and the tests in that same file. Domain reasoning, rejected
alternatives, and cross-file invariants qualify. Anything that restates what the code
already says gets one line or none.

**The deletion test.** Delete the comment and ask whether a later change could now
break something quietly. If it could, the comment stays at whatever length the reason
takes. If nothing breaks, the lines were restatement.

The test is about the reader who arrives to change the code, not the reader who arrives
to understand it. `Math.round(unitQuantity * baseEquivalentAtEntry)` written out in a
comment helps the second reader and misleads the first, because it goes stale the
moment the expression moves. Why the value is snapshotted at all cannot go stale, and
cannot be recovered from the field either.

Density is not a target. Roughly one comment line per ten lines of code is where this
repo sits, and that is fine. A file with nothing non-derivable to say stays bare.

## Register: ASD-STE100 writing rules

Comments are written to the writing rules of ASD-STE100, Simplified Technical English:

- One topic per sentence.
- Twenty words or fewer for a descriptive sentence.
- Active voice, present tense.
- No idiom. No participial phrases.
- Noun clusters of at most three words.
- Never drop an article.

**The writing rules only, not the licensed dictionary.** The dictionary cannot be
checked offline, and claiming conformance to a specification nobody here can verify
would be a claim with nothing behind it. Domain terms are admitted as Technical Names,
`utang` included.

What this costs is real and was accepted deliberately. The narrative voice goes. Prose
like _"The customer is at the counter holding the goods, so refusing the write buys an
unrecorded sale and a permanently wrong utang balance"_ becomes flat declaratives. The
reason survives; the force of it does not. The trade buys a register an agent can
reproduce on a file it has never seen, which the narrative voice never was.

## Vocabulary comes from `CONTEXT.md`

Name a domain concept with the term `CONTEXT.md` defines. An `_Avoid_` term in a
comment is a defect.

One exception: an `_Avoid_` term may appear when the sentence is **about** the term —
recording that the code spells something `oversold` where the glossary says Negative
projection, for instance. It may never stand as the way of naming the concept.

If the concept you need is missing from the glossary, that is a signal, not a licence to
invent a word. See `docs/agents/domain.md`.

## Linter directives are exempt

`biome-ignore` and `@ts-expect-error` keep their shape. Their form is fixed by the tool,
and rewriting them to the register would break the suppression.

The one requirement is that each states a reason:

```ts
// biome-ignore lint/a11y/useKeyWithClickEvents: mouse-only dismiss; Escape handled in useEffect above
```

All of them currently do.

## Compress, never delete

Prose that fails the deletion test is compressed to one line, not cut. The reasoning
that produced it was usually real, and deleting it discards the reason along with the
words.

Where the reason belongs in an ADR, compress to one line plus a reference, in the
citation style already used in the code:

```ts
// See docs/adr/0003-base-unit-storage.md.
```

Write a new ADR only where no existing one covers the reasoning. `docs/adr/` is the
place for an argument; a comment is the place for a pointer to it.

## Applying it to a file

1. Read the file whole. The deletion test needs the code, the types, and the tests it
   sits beside.
2. Run the deletion test on every existing comment. Keep, compress, or leave alone.
3. Restyle every kept comment to the register, and check its terms against
   `CONTEXT.md`.
4. Add a comment only where something non-derivable currently goes unsaid.

Done when every comment in the file passes both the deletion test and the register
rules, and every `_Avoid_` term is gone or is a sentence about itself.

## Worked pairs

All four are real code from this repo.

### A reason that earns its lines, flattened to the register

`src/app/page.tsx` — the comment stays long, because nothing about it is recoverable
from the code.

Before:

```ts
// Lines this sale would drive below zero, netted per product in Base units
// — two lines of one product, in the same Unit or different ones, are
// judged on what the sale actually takes off the shelf. They warn — they
// never block. The customer is at the counter holding the goods, so
// refusing the write buys an unrecorded sale and a permanently wrong utang
// balance.
```

After:

```ts
// The Negative projections this sale would leave. The check nets the Lines
// per product in Base units. Two Lines of one product therefore give one
// judgement, whether they name the same Unit or different Units.
// A Negative projection warns. It never blocks the save. The customer waits
// at the counter with the goods. A refused write costs the shop an
// unrecorded sale and a wrong Utang balance.
```

Six lines before, six after. The register changed; the length did not, because the
length was never the problem. Note the vocabulary: "below zero" becomes Negative
projection, and `utang` becomes the Technical Name Utang.

### A restated expression compresses; the reason stays

`convex/schema.ts`, on `baseEquivalentAtEntry`.

Before:

```ts
// Snapshot of that Unit's Base equivalent at the time of the write. The
// Base amount is never stored — it is derived on every read as
// `Math.round(unitQuantity * baseEquivalentAtEntry)`. See
// docs/adr/0003-base-unit-storage.md.
```

After:

```ts
// The Unit's Base equivalent at the moment of the write. An edit to the
// product's Units therefore leaves this Movement's Base amount unchanged.
// See docs/adr/0003-base-unit-storage.md.
```

The expression is derivable from the read path and goes stale if that path moves. The
ADR reference and the invariant it protects are neither.

### A JSDoc where every line survives the test

`convex/stockMovements.ts`, on `DIRECTION`. This is a cross-file invariant with no
other home, so all of it stays.

Before:

```ts
/**
 * The sign each movement type carries. A `stockMovements` row stores `quantity`
 * as a signed delta so every cache update is a plain add with no per-type
 * branching — but that sign is redundant with the `type` sitting beside it, and
 * a schema comment is not what stops a positive pull-out. This table is. It is
 * the only place in the codebase that knows which way a type moves stock, and
 * every row in the ledger goes through it — there is no second write path that
 * sets a count without moving it.
 */
```

After:

```ts
/**
 * The sign each Movement type carries. A `stockMovements` row holds a signed
 * delta, so a cache update is a plain add with no per-type branch.
 * The sign duplicates the `type` beside it. A schema comment does not stop a
 * positive Pull-out. This table does.
 * This table is the only place that knows which way a type moves stock. Every
 * row in the Ledger goes through it. There is no second write path.
 */
```

The em-dash chains become separate sentences, and each sentence carries one topic. Pull-out
and Ledger take their glossary spelling.

### A bare file that has something to say

`src/lib/auth.ts` carries no comments today. It is one of the few bare files where
something non-derivable goes unsaid.

After:

```ts
/**
 * The shop's single shared passcode, held as a session cookie. There are no
 * user accounts, so the cookie only proves that somebody knew the passcode.
 * The token is a hash of the passcode. The server therefore recomputes the
 * expected token from `APP_PASSCODE` and keeps no session table.
 * The cookie lasts ten years, so the till tablet stays logged in between shifts.
 */
```

Most bare files are not like this one. An eleven-line page shim such as
`src/app/products/[id]/page.tsx` has nothing non-derivable to say, and it stays bare.
Four-line `convex/money.ts` sits at the other end of the same rule: one sentence about
centavos is the whole of what its code cannot say for itself.
