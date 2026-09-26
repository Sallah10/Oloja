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

export type MonthStory = {
  label: string;
  sales: SalesSlice;
  creditMinor: number;
  paymentsMinor: number;
  /** Profit on sales whose product has a cost recorded. Seeded items with no
   *  cost aren't guessed at - they're counted and surfaced instead. */
  profitKnownMinor: number;
  unknownCostSaleCount: number;
  bestDay: { amountMinor: number; label: string } | null;
  quietDays: number;
  days: { label: string; amountMinor: number }[];
};

export function monthStory(
  transactions: TransactionSummary[],
  products: ProductSummary[],
  now: Date = new Date(),
): MonthStory {
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = new Date(year, month, 1).getTime();
  const monthEnd = new Date(year, month + 1, 1).getTime();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byProduct = new Map(products.map((p) => [p.id, p]));

  let sales = 0;
  let saleCount = 0;
  let creditCount = 0;
  let creditMinor = 0;
  let paymentsMinor = 0;
  let profitKnownMinor = 0;
  let unknownCostSaleCount = 0;

  for (const t of transactions) {
    const ts = new Date(t.createdAt).getTime();
    if (ts < monthStart || ts >= monthEnd) continue;
    if (t.type === "PAYMENT") {
      paymentsMinor += t.amountMinor;
      continue;
    }
    sales += t.amountMinor;
    saleCount += 1;
    if (t.onCredit) {
      creditCount += 1;
      creditMinor += t.amountMinor;
    }

    const product = t.productId ? byProduct.get(t.productId) : undefined;
    if (!product) continue;
    if (product.costMinor > 0) {
      profitKnownMinor +=
        Math.max(0, (t.unitPriceMinor ?? product.priceMinor) - product.costMinor) * t.quantity;
    } else {
      unknownCostSaleCount += 1;
    }
  }

  let bestDay: MonthStory["bestDay"] = null;
  let quietDays = 0;
  const daysSeen = Math.min(daysInMonth, now.getDate());
  const days: MonthStory["days"] = [];
  for (let d = 1; d <= daysSeen; d++) {
    const date = new Date(year, month, d);
    const amount = salesOn(transactions, date).amountMinor;
    const label = date.toLocaleDateString("en-NG", { weekday: "short", day: "numeric" });
    days.push({ label, amountMinor: amount });
    if (amount === 0) {
      quietDays += 1;
      continue;
    }
    if (!bestDay || amount > bestDay.amountMinor) bestDay = { amountMinor: amount, label };
  }

  return {
    label: new Date(year, month, 1).toLocaleDateString("en-NG", {
      month: "long",
      year: "numeric",
    }),
    sales: { amountMinor: sales, count: saleCount, creditCount },
    creditMinor,
    paymentsMinor,
    profitKnownMinor,
    unknownCostSaleCount,
    bestDay,
    quietDays,
    days,
  };
}

export type SlowMover = {
  name: string;
  stockQty: number;
  lastSaleAt: string | null;
};

/** Products with stock that haven't sold for a while - money sitting on the
 *  shelf instead of in your hand. Sorted by how much is parked. */
export function slowMovers(
  transactions: TransactionSummary[],
  products: ProductSummary[],
  inactiveDays = 13,
): SlowMover[] {
  const cutoff = daysAgoUtcMs(inactiveDays);
  const lastSale = new Map<string, string>();
  for (const t of transactions) {
    if (t.type !== "SALE" || !t.productId) continue;
    const existing = lastSale.get(t.productId);
    if (!existing || t.createdAt > existing) lastSale.set(t.productId, t.createdAt);
  }
  return products
    .filter((p) => p.stockQty > 0)
    .map((p) => ({ name: p.name, stockQty: p.stockQty, lastSaleAt: lastSale.get(p.id) ?? null }))
    .filter((m) => !m.lastSaleAt || +new Date(m.lastSaleAt) < cutoff)
    .sort((a, b) => b.stockQty - a.stockQty)
    .slice(0, 6);
}

export function topDebtors(customers: CustomerSummary[], limit = 5): CustomerSummary[] {
  return customers
    .filter((c) => c.debtMinor > 0)
    .sort((a, b) => b.debtMinor - a.debtMinor)
    .slice(0, limit);
}