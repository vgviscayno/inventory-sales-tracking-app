/**
 * A count next to a Unit's label. The label inflects to agree with the count,
 * so the results read "1 tray", "3 trays", and "0 trays".
 *
 * A Unit's label is freeform text somebody types, and nothing asks for a
 * second form of it. This module therefore derives the plural instead of
 * storing it. There is no column on the Unit, no migration, and no extra box
 * on the product form. There is also no question about which form a
 * `stockMovements` row snapshots.
 *
 * `pluralize` inflects in both directions, which makes the derivation safe on
 * data that predates this module. A label already typed as "trays" still reads
 * "1 tray" and not "1 trayss". `pluralize` also gets the count rule right on
 * its own. It gives the singular at exactly 1, and the plural at 0, at a
 * fraction, and at a negative count.
 *
 * Every screen that shows a count beside a label goes through this module, so
 * the wording cannot drift apart. The stock readings in remainderReading.ts,
 * the Delivery sheet, and the Pull-out sheet call `formatCount`. The
 * Register's cart Lines and the Sale sheet lay the count out themselves, and
 * call `unitLabelFor`.
 * A price quote is not a count and stays singular, as in "₱30 / tray". A label
 * that stands alone in a picker stays singular too.
 */

import pluralize from "pluralize";

/**
 * Labels that never take an "s". Two kinds sit here, and `pluralize` gets both
 * wrong for one reason. It knows English nouns, and it reads every label as
 * one.
 *
 *   - A unit of measure is an abbreviation and not a word. `pluralize` would
 *     otherwise render "2 kgs" and "500 gs".
 *   - A Tagalog noun does not inflect for number at all. "3 sako" is correct
 *     and "3 sakos" is not.
 *
 * This list is the cost of deriving the plural instead of storing it. A label
 * nobody anticipated inflects wrongly until somebody adds it here, and nobody
 * in the shop can fix that. Add to the list freely. The rule is
 * case-insensitive, and one entry costs nothing.
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
 * `pluralize` walks a list of regex rules on every call. The cost is about
 * 0.5µs, which is already free at a hundred products. A catalogue also holds
 * about a dozen distinct labels, and each label has two forms. This Map
 * therefore keeps the answers. Every lookup after the first render is a Map
 * hit.
 */
const inflected = new Map<string, string>();

/**
 * The label alone. It agrees with `count`. This module exposes it separately
 * from `formatCount`, for the callers that lay the count out themselves. A
 * stepper's own number and a signed Unit quantity are two such counts.
 */
export function unitLabelFor(count: number, label: string): string {
  // The magnitude decides, and not the signed count. A movement sheet renders
  // a Sale of one tray as "-1". That is one tray leaving, so it reads "-1
  // tray". A count of -3 is plural either way.
  const singular = Math.abs(count) === 1;

  // The key holds the two outcomes and not `count`, so "3" and "47" share one
  // entry. `pluralize` preserves the label's case, so the raw label is the
  // right key. "Tray" and "tray" genuinely have different answers.
  const key = singular ? `1:${label}` : `n:${label}`;
  const hit = inflected.get(key);
  if (hit !== undefined) return hit;

  const result = pluralize(label, singular ? 1 : 2);
  inflected.set(key, result);
  return result;
}

/** The count and its label together, as in "3 trays". */
export function formatCount(count: number, label: string): string {
  return `${count} ${unitLabelFor(count, label)}`;
}
