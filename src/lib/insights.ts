import { CustomerSummary, ProductSummary, TransactionSummary } from "./types";
import { daysAgoUtcMs } from "./time";

/**
 * Insights are pure questions the screens ask of the ledger. Kept here so the
 * dashboard, sales and customers pages all tell consistent stories about the
 * same numbers.
 */

export type SalesSlice = {
  amountMinor: number;
  count: number;
  creditCount: number;
};

function sliceOf(transactions: TransactionSummary[], from: number, to?: number): SalesSlice {
  let amountMinor = 0;
  let count = 0;
  let creditCount = 0;
  for (const t of transactions) {
    const ts = new Date(t.createdAt).getTime();
    if (from !== -1 && ts < from) continue;
    if (to !== undefined && ts >= to) continue;
    if (t.type !== "SALE") continue;
    amountMinor += t.amountMinor;
    count += 1;
    if (t.onCredit) creditCount += 1;
  }
  return { amountMinor, count, creditCount };
}

export function salesToday(transactions: TransactionSummary[]): SalesSlice {
  return sliceOf(transactions, daysAgoUtcMs(0));
}

export function salesThisWeek(transactions: TransactionSummary[]): SalesSlice {
  return sliceOf(transactions, daysAgoUtcMs(6));
}

export function salesThisMonth(transactions: TransactionSummary[]): SalesSlice {
  return sliceOf(transactions, daysAgoUtcMs(29));
}

export function salesOn(transactions: TransactionSummary[], date: Date): SalesSlice {
  const from = new Date(date);
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return sliceOf(transactions, from.getTime(), to.getTime());
}

export function totalOwed(customers: CustomerSummary[]): number {
  return customers.reduce((sum, c) => sum + Math.max(0, c.debtMinor), 0);
}

export type StockCounts = {
  onHand: number;
  low: number;
  out: number;
  healthy: number;
};

export function stockCounts(products: ProductSummary[]): StockCounts {
  let onHand = 0;
  let low = 0;
  let out = 0;
  let healthy = 0;
  for (const p of products) {
    onHand += p.stockQty;
    if (p.stockQty === 0) out += 1;
    else if (p.stockQty <= p.lowStockThreshold) low += 1;
    else healthy += 1;
  }
  return { onHand, low, out, healthy };
}

export type TopProduct = {
  name: string;
  quantity: number;
};

/** Best-selling product over the trailing 7 days, by units sold. */
export function topProductThisWeek(
  transactions: TransactionSummary[],
  products: ProductSummary[],
): TopProduct | null {
  const from = daysAgoUtcMs(6);
  const byProduct = new Map<string, { quantity: number; time: number }>();
  for (const t of transactions) {
    if (t.type !== "SALE" || !t.productId) continue;
    const ts = new Date(t.createdAt).getTime();
    if (ts < from) continue;
    const current = byProduct.get(t.productId) ?? { quantity: 0, time: 0 };
    byProduct.set(t.productId, {
      quantity: current.quantity + t.quantity,
      time: ts,
    });
  }
  if (byProduct.size === 0) return null;
  const bestId = [...byProduct.entries()].sort(
    (a, b) => b[1].quantity - a[1].quantity || b[1].time - a[1].time,
  )[0][0];
  const best = byProduct.get(bestId);
  const product = products.find((p) => p.id === bestId);
  if (!best || !product) return null;
  return { name: product.name, quantity: best.quantity };
}

/** Customer currently owing the most, so the owner knows who to gently chase. */
export function biggestDebtor(customers: CustomerSummary[]): CustomerSummary | null {
  return (
    customers.filter((c) => c.debtMinor > 0).sort((a, b) => b.debtMinor - a.debtMinor)[0] ?? null
  );
}

export function profitPerUnit(product: ProductSummary): number {
  return product.priceMinor - product.costMinor;
}