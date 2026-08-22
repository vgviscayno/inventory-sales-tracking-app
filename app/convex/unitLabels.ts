/**
 * Putting a count next to a Unit's label, with the label inflected to agree
 * with it — "1 tray", "3 trays", "0 trays".
 *
 * A Unit's label is freeform text she types, and nothing has ever asked her
 * for a second form of it. So the plural is derived here rather than stored:
 * no column on the Unit, no migration, no extra boxes on the product form,
 * and no question about which form a `stockMovements` row snapshots.
 *
 * `pluralize` inflects in both directions, which is what makes deriving it
 * safe on data that predates this module — a label already typed as "trays"
 * still reads "1 tray", not "1 trayss". It also gets the count rule right on
 * its own: singular at exactly 1, plural at 0, at fractions, and at negatives.
 *
 * Every screen that shows a count beside a label goes through `formatCount`
 * — the stock readings in remainderReading.ts, the Register's cart lines, and
 * the three movement sheets — so they cannot drift apart in wording. A price
 * quote is not a count and stays singular ("₱30 / tray"), as does a label
 * standing alone in a picker.
 */

import pluralize from "pluralize";

/**
 * Labels that never take an "s". Two kinds sit here, and `pluralize` gets both
 * wrong for the same reason — it knows English nouns and assumes every label
 * is one:
 *
 *   - Units of measure, which are abbreviations rather than words: it would
 *     otherwise render "2 kgs" and "500 gs".
 *   - Tagalog nouns, which do not inflect for number at all. "3 sako" is
 *     correct; "3 sakos" is not.
 *
 * This list is the cost of deriving the plural instead of storing it: a label
 * nobody anticipated inflects wrongly until it is added here, and she cannot
 * fix that herself. Add to it freely — the rule is case-insensitive, and
 * registering one costs nothing.
 */
const UNCOUNTABLE_LABELS = [
  "kg",
  "g",
  "ml",
  "l",
  "sako",
  "kaha",
  "tali",
  "bilao",
];

for (const label of UNCOUNTABLE_LABELS) {
  pluralize.addUncountableRule(label);
}

/**
 * `pluralize` walks a list of regex rules on every call — about 0.5µs, which
 * is already free at a hundred-odd products, but a catalogue only holds a
 * dozen distinct labels and each has two forms. So the answers are kept:
 * after the first render every lookup is a Map hit.
 */
const inflected = new Map<string, string>();

/**
 * The label alone, agreeing with `count`. Exposed separately from
 * `formatCount` for the callers that lay the count out themselves — a
 * stepper's own number, a signed quantity.
 */
export function unitLabelFor(count: number, label: string): string {
  // The magnitude decides, not the signed count: a movement sheet renders a
  // sale of one tray as "-1", and that is one tray leaving, so it reads "-1
  // tray". A count of -3 is still plural either way.
  const singular = Math.abs(count) === 1;

  // Keyed on the two outcomes rather than on `count`, so "3" and "47" share
  // one entry. `pluralize` preserves the label's case, so the raw label is
  // the right key — "Tray" and "tray" genuinely have different answers.
  const key = singular ? `1:${label}` : `n:${label}`;
  const hit = inflected.get(key);
  if (hit !== undefined) return hit;

  const result = pluralize(label, singular ? 1 : 2);
  inflected.set(key, result);
  return result;
}

/** The count and its label together — "3 trays". */
export function formatCount(count: number, label: string): string {
  return `${count} ${unitLabelFor(count, label)}`;
}
