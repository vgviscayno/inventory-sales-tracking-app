/**
 * How an Entry reads on the Movements tab.
 *
 * An Entry holds one Movement per product. Each Movement carries its own Unit.
 * The tab showed one figure for the whole Entry: the sum of its Lines in Base
 * units. That figure adds different goods together. It also reads in a Unit
 * nobody chose. A Delivery of twenty trays of eggs showed "+600".
 *
 * This module reads an Entry one product at a time. It never adds across
 * products. A tray of eggs holds thirty. A tray of tomatoes holds twelve. The
 * two are different Units under one word. "16 trays" is a figure nobody can
 * check.
 *
 * Within one product, two Lines merge into one term. The merge applies only
 * where the Unit label and the Base equivalent both agree. The Base equivalent
 * comes off each Movement's own snapshot, and not off the product. An edit to
 * the product's Units therefore cannot merge two Lines that different Units
 * recorded. A merge on the label alone joins them. See
 * docs/adr/0003-base-unit-storage.md.
 *
 * Products keep the order of their first Line. Terms keep that order too.
 * Neither is sorted, so an Entry reads back in the order somebody wrote it.
 *
 * unitLabels.ts inflects each term's label to agree with its own count. A term
 * reads "+1 tray" and "+10 trays". Nothing here reads against a Reading
 * ladder. A Line already names the Unit somebody chose, and a ladder spells a
 * figure nobody entered. See "Unit quantity" and "Movement" in CONTEXT.md.
 */

import { unitLabelFor } from "../../../convex/unitLabels";
import { signed } from "../format";

/** One Line of an Entry, as `entryLines` hands it back. */
export type EntryLine = {
  productId: string;
  productName: string;
  unitLabel: string;
  unitQuantity: number;
  baseEquivalentAtEntry: number;
};

/** One product's amount in one of its Units, as in "+10 trays". */
export type EntryTerm = {
  /** Identifies the Unit, and not the label alone. Two labels can collide. */
  key: string;
  unitLabel: string;
  unitQuantity: number;
};

/** One product's whole part in an Entry. */
export type ProductReading = {
  productId: string;
  productName: string;
  terms: EntryTerm[];
};

/**
 * An Entry's Lines, gathered per product. Every product in the Entry gives one
 * reading. A product that several Lines name gives one reading with several
 * terms.
 */
export function readEntryByProduct(lines: EntryLine[]): ProductReading[] {
  const readings = new Map<string, ProductReading>();

  for (const line of lines) {
    const reading = readings.get(line.productId);
    if (reading === undefined) {
      readings.set(line.productId, {
        productId: line.productId,
        productName: line.productName,
        terms: [termOf(line)],
      });
      continue;
    }
    const key = unitKey(line);
    const term = reading.terms.find((t) => t.key === key);
    if (term) term.unitQuantity += line.unitQuantity;
    else reading.terms.push(termOf(line));
  }

  return [...readings.values()];
}

function unitKey(line: EntryLine): string {
  return `${line.unitLabel}@${line.baseEquivalentAtEntry}`;
}

function termOf(line: EntryLine): EntryTerm {
  return {
    key: unitKey(line),
    unitLabel: line.unitLabel,
    unitQuantity: line.unitQuantity,
  };
}

/** One term spoken, as in "+10 trays". */
function formatTerm(term: EntryTerm): string {
  return `${signed(term.unitQuantity)} ${unitLabelFor(
    term.unitQuantity,
    term.unitLabel,
  )}`;
}

/**
 * A product's terms spoken together, as in "-1 tray, -3 pcs". A term of zero
 * still shows. Somebody entered that Line, and a drop hides it.
 */
export function formatProductReading(reading: ProductReading): string {
  return reading.terms.map(formatTerm).join(", ");
}
