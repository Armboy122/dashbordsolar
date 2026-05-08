export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || value === "--") return null;
  const number = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : null;
}

export function safeDivide(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return numerator / denominator;
}

export function sum(values: Array<number | null>): number {
  return values.reduce<number>((total, value) => total + (Number.isFinite(value) ? Number(value) : 0), 0);
}

export function median(values: Array<number | null>): number | null {
  const sorted = values
    .filter((value): value is number => Number.isFinite(value))
    .sort((a, b) => a - b);

  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function average(values: Array<number | null>): number | null {
  const valid = values.filter((value): value is number => Number.isFinite(value));
  if (!valid.length) return null;
  return sum(valid) / valid.length;
}

export function formatNumber(value: number | null, digits = 0): string {
  if (!Number.isFinite(value)) return "-";
  return Number(value).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(value: number | null, digits = 0): string {
  if (!Number.isFinite(value)) return "-";
  return `${(Number(value) * 100).toFixed(digits)}%`;
}
