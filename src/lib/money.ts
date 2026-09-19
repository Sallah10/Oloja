const CURRENCY_SYMBOL = "\u20A6";

export function formatMoney(amount: number): string {
  const hasFraction = !Number.isInteger(amount);
  const formatted = amount.toLocaleString("en-NG", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  });
  return `${CURRENCY_SYMBOL}${formatted}`;
}