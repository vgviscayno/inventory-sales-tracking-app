/** Money is never allowed a fraction of a centavo, on a line or a total. */
export function roundCentavos(n: number): number {
  return Math.round(n * 100) / 100;
}
