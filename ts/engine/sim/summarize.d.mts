export type Counts = Record<string, number>;
export function wilson(wins: number, n: number): [number, number];
export function compareResults(
  a: Record<string, Counts>,
  b: Record<string, Counts>,
): { identical: boolean; differing: string[] };
export function summaryLines(results: Record<string, Counts>): string[];
