/** Money never holds a fraction of a centavo, on a Line or on a total. */
export function roundCentavos(n: number): number {
  return Math.round(n * 100) / 100;
}
