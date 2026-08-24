/**
 * The Unit labels the catalog already uses, offered to somebody who declares a
 * product on the Delivery sheet. A shop that counts three things in sacks does
 * not type "sack" a fourth time.
 *
 * A Unit's label is text somebody types. `piece` and `Piece` are therefore two
 * rows in the catalog, and one Unit to anybody who reads them. This module
 * groups the labels by their lower-cased form. Each group offers its commonest
 * spelling. The same Unit cannot appear twice.
 */

/**
 * The distinct labels in `labels`, commonest first. A tie sorts
 * alphabetically, so the list holds still between renders.
 */
export function rankLabels(labels: string[]): string[] {
  const groups = new Map<string, Map<string, number>>();
  for (const label of labels) {
    const key = label.trim().toLowerCase();
    if (!key) continue;
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(label, (spellings.get(label) ?? 0) + 1);
    groups.set(key, spellings);
  }

  return [...groups.values()]
    .map((spellings) => {
      const spelling = [...spellings.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      );
      const total = spelling.reduce((sum, [, n]) => sum + n, 0);
      return { label: spelling[0][0], total };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .map((g) => g.label);
}

/**
 * The two lists the new-product step offers, from the catalog it is declared
 * against.
 *
 * They differ because the two fields ask different questions. The Base unit
 * field takes only labels that are already some product's Base unit. A `dozen`
 * or a `tray` is a real Unit and a bad Unit to base a product in. A suggestion
 * there reads as an endorsement, and the choice locks on the first Movement.
 * See docs/adr/0004-base-unit-locked.md.
 * The second-Unit field takes every label, which is where a tray belongs.
 */
export function unitSuggestions(
  products: { baseUnitLabel: string; units: { label: string }[] }[],
) {
  return {
    baseUnits: rankLabels(products.map((p) => p.baseUnitLabel)),
    allUnits: rankLabels(products.flatMap((p) => p.units.map((u) => u.label))),
  };
}
