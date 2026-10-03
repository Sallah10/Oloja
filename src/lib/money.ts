const CURRENCY_SYMBOL = "\u20A6";

export function formatMoney(amount: number): string {
  const hasFraction = !Number.isInteger(amount);
  const formatted = amount.toLocaleString("en-NG", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
  return `${CURRENCY_SYMBOL}${formatted}`;
}

// Parses a user-typed naira amount ("1250" or "1250.50") into minor units
// (kobo). Returns null when the text is not a valid non-negative amount.
export function toMinorUnits(nairaInput: string): number | null {
  const trimmed = nairaInput.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(",", ""));
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}