import type { CustomerSummary, ProductSummary, TransactionSummary } from "./types";
import { daysAgoUtcMs, formatShortDate, startOfDay } from "./time";
import { formatMoney } from "./money";
import { monthStory, salesOn, salesThisWeek, totalOwed } from "./insights";

/**
 * The whisper is a small on-device advisor that reads the ledger and tells the
 * owner the one or three things that actually need their attention - reorder a
 * mover, chase an old balance, free money parked on the shelf.
 *
 * Every line it produces is grounded in real records: nothing is guessed or
 * generated. (The idea, later, is an optional online model that can *rephrase*
 * the same, local, verified facts into a weekly letter - never invent new
 * ones.) Kept framework-free so it can be tested and reasoned about on its own.
 */

export type WhisperTone = "accent" | "gold" | "danger" | "neutral";

export type WhisperCard = {
  id: string;
  tone: WhisperTone;
  /** Icon name for the row; the UI maps it to Ionicons. */
  icon: string;
  title: string;
  body: string;
  action?: { label: string; path: string };
};

export type WhisperThread = {
  headline: string;
  cards: WhisperCard[];
};

type ProductStats = {
  lastSaleAt: string | null;
  units7: number;
  units14: number;
};

function productStats(transactions: TransactionSummary[]): Map<string, ProductStats> {
  const stats = new Map<string, ProductStats>();
  const cutoff7 = daysAgoUtcMs(6);
  const cutoff14 = daysAgoUtcMs(13);
  for (const t of transactions) {
    if (t.type !== "SALE" || !t.productId) continue;
    const ts = new Date(t.createdAt).getTime();
    const current = stats.get(t.productId) ?? { lastSaleAt: null, units7: 0, units14: 0 };
    if (!current.lastSaleAt || t.createdAt > current.lastSaleAt) current.lastSaleAt = t.createdAt;
    if (ts >= cutoff7) current.units7 += t.quantity;
    if (ts >= cutoff14) current.units14 += t.quantity;
    stats.set(t.productId, current);
  }
  return stats;
}

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((startOfDay().getTime() - +new Date(iso)) / 86400000));
}

function latestPaymentAt(transactions: TransactionSummary[], customerId: string): string | null {
  let at: string | null = null;
  for (const t of transactions) {
    if (t.type !== "PAYMENT" || t.customerId !== customerId) continue;
    if (!at || t.createdAt > at) at = t.createdAt;
  }
  return at;
}

/** The owner's daily average take across the trailing 29 days. */
function averageDailyTake(transactions: TransactionSummary[]): number {
  const from = daysAgoUtcMs(29);
  let total = 0;
  for (const t of transactions) {
    if (t.type !== "SALE") continue;
    const ts = new Date(t.createdAt).getTime();
    if (ts >= from) total += t.amountMinor;
  }
  return total / 30;
}

function sincePhrase(iso: string): string {
  const days = daysSince(iso);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return `on ${formatShortDate(iso)}`;
}

/**
 * Turn the ledger into ranked whisper cards. Pure and deterministic for the
 * same inputs - the tests lean on that.
 */
export function whisper(
  products: ProductSummary[],
  customers: CustomerSummary[],
  transactions: TransactionSummary[],
  now: Date = new Date(),
): WhisperThread {
  const stats = productStats(transactions);
  const candidates: { card: WhisperCard; score: number }[] = [];

  // Out of stock but still being asked for.
  const outItem = products
    .filter((p) => p.stockQty === 0)
    .map((p) => ({ product: p, u: stats.get(p.id) }))
    .filter((x) => x.u && x.u.units14 > 0)
    .sort((a, b) => (b.u?.units14 ?? 0) - (a.u?.units14 ?? 0))[0];
  if (outItem) {
    const { product, u } = outItem;
    candidates.push({
      score: 85 + (u?.units14 ?? 0) * 3,
      card: {
        id: `out-${product.id}`,
        tone: "danger",
        icon: "alert-circle-outline",
        title: `Out of ${product.name}`,
        body: `You sold ${u?.units14} in the last fortnight and now it's gone. That's a sale slipping away every day it stays empty.`,
        action: { label: "Restock", path: "/inventory" },
      },
    });
  }

  // Running low on something that is still moving fast - restock now.
  const restockItem = products
    .filter((p) => p.stockQty > 0 && p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold)
    .map((p) => ({ product: p, u: stats.get(p.id) }))
    .filter((x) => x.u && x.u.units7 > 0)
    .sort((a, b) => (b.u?.units7 ?? 0) - (a.u?.units7 ?? 0))[0];
  if (restockItem) {
    const { product, u } = restockItem;
    const units = u?.units7 ?? 0;
    candidates.push({
      score: 80 + units * 4,
      card: {
        id: `low-${product.id}`,
        tone: "danger",
        icon: "basket-outline",
        title: `Restock ${product.name}`,
        body: `Down to ${product.stockQty} and it sold ${units} in the last week. Restock before you start turning people away.`,
        action: { label: "Restock", path: "/inventory" },
      },
    });
  }

  // Money parked on the shelf: stock that hasn't moved for a couple of weeks.
  const parkedValue = (p: ProductSummary) => p.stockQty * p.priceMinor;
  const parked = products
    .filter((p) => {
      const s = stats.get(p.id);
      return p.stockQty > 0 && !!s?.lastSaleAt && daysSince(s.lastSaleAt) >= 13;
    })
    .sort((a, b) => parkedValue(b) - parkedValue(a))[0];
  if (parked) {
    const s = stats.get(parked.id)!;
    candidates.push({
      score: 58 + Math.min(parkedValue(parked) / 50000, 22),
      card: {
        id: `parked-${parked.id}`,
        tone: "accent",
        icon: "archive-outline",
        title: `${parked.stockQty} of ${parked.name} parked`,
        body: `Last sale ${sincePhrase(s.lastSaleAt!)} - that's ${formatMoney(parkedValue(parked))} sitting still. A small moving-day price could free it.`,
        action: { label: "Turn it over", path: "/inventory" },
      },
    });
  }

  // An older owed balance with no recent payment - the gentle-chase one.
  const debtor = customers.filter((c) => c.debtMinor > 0).sort((a, b) => b.debtMinor - a.debtMinor)[0];
  if (debtor) {
    const paidAt = latestPaymentAt(transactions, debtor.id);
    if (paidAt === null || daysSince(paidAt) >= 7) {
      candidates.push({
        score: 70 + Math.min(debtor.debtMinor / 100000, 18),
        card: {
          id: `chase-${debtor.id}`,
          tone: "gold",
          icon: "hand-left-outline",
          title: `Gently chase ${debtor.name}`,
          body:
            paidAt === null
              ? `${debtor.name} owes ${formatMoney(debtor.debtMinor)} and hasn't paid anything yet. One soft reminder brings most of these in.`
              : `${debtor.name} owes ${formatMoney(debtor.debtMinor)} and last paid ${sincePhrase(paidAt)}. A friendly nudge usually settles it.`,
          action: { label: "Remind them", path: `/customer/${debtor.id}` },
        },
      });
    }
  }

  // A day that beat the owner's usual rhythm.
  const todayTake = salesOn(transactions, now).amountMinor;
  const avg = averageDailyTake(transactions);
  if (todayTake > 0 && avg > 0 && todayTake >= avg * 1.6) {
    const pct = Math.round((todayTake / avg) * 100);
    candidates.push({
      score: 46,
      card: {
        id: "strong-day",
        tone: "accent",
        icon: "sunny-outline",
        title: "Strong day",
        body: `Today's take is ${pct}% above your usual average of ${formatMoney(Math.round(avg))}. Restock early tomorrow and ride it.`,
        action: { label: "Record the day", path: "/sales" },
      },
    });
  }

  // Profit can't speak until costs are recorded.
  const noCost = products.filter((p) => p.costMinor === 0).length;
  if (noCost > 0) {
    candidates.push({
      score: 24,
      card: {
        id: "no-cost",
        tone: "neutral",
        icon: "receipt-outline",
        title: "Profit is half-heard",
        body: `${noCost} product${noCost === 1 ? "" : "s"} ha${noCost === 1 ? "s" : "ve"} no cost price, so profit stays quiet. Type it in when you next restock.`,
        action: { label: "Set costs", path: "/inventory" },
      },
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const cards = candidates.slice(0, 3).map((c) => c.card);

  if (cards.length === 0) {
    cards.push({
      id: "all-quiet",
      tone: "neutral",
      icon: "leaf-outline",
      title: "All quiet",
      body: "Nothing needs your eye right now. The whisper tunes itself to your ledger and wakes when there's something worth saying.",
    });
  }

  return { headline: headlineFor(cards[0].id), cards };
}

function headlineFor(firstId: string): string {
  if (firstId === "all-quiet") return "Nothing's pressing today.";
  if (firstId.startsWith("out-") || firstId.startsWith("low-")) return "Stock first - takers are waiting.";
  if (firstId.startsWith("chase-")) return "Owed money comes to those who ask.";
  if (firstId.startsWith("parked-")) return "Some of your money is asleep on the shelf.";
  if (firstId === "strong-day") return "Today was a day worth banking on.";
  return "Here's what the ledger is saying.";
}

/**
 * The business-health read: the money-numbers that sit behind the alerts.
 * Every figure is computed from real records - capital in goods (stock x its
 * cost), money parked, what customers owe, and how this month is tracking.
 */
export type BusinessHealth = {
  capitalInGoodsMinor: number;
  parkedMinor: number;
  owedMinor: number;
  monthTakeMinor: number;
  monthCreditShare: number;
  weeksTakeMinor: number;
  avgDailyTakeMinor: number;
  topProductShare: number;
  belowCostRecentCount: number;
  unknownCostGoodsCount: number;
};

export function businessHealth(
  products: ProductSummary[],
  customers: CustomerSummary[],
  transactions: TransactionSummary[],
  now: Date = new Date(),
): BusinessHealth {
  const stats = productStats(transactions);
  const byProduct = new Map(products.map((p) => [p.id, p]));
  const month = monthStory(transactions, products, now);

  let capitalInGoods = 0;
  let parkedMinor = 0;
  let unknownCost = 0;
  for (const p of products) {
    if (p.costMinor > 0) capitalInGoods += p.stockQty * p.costMinor;
    else unknownCost += 1;
    const s = stats.get(p.id);
    if (p.stockQty > 0 && !!s?.lastSaleAt && daysSince(s.lastSaleAt) >= 13) {
      parkedMinor += p.stockQty * p.priceMinor;
    }
  }

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const unitsByProduct = new Map<string, number>();
  let totalUnits = 0;
  for (const t of transactions) {
    if (t.type !== "SALE" || !t.productId) continue;
    if (new Date(t.createdAt).getTime() < monthStart) continue;
    totalUnits += t.quantity;
    unitsByProduct.set(t.productId, (unitsByProduct.get(t.productId) ?? 0) + t.quantity);
  }
  const topProductShare = totalUnits > 0 ? Math.max(0, ...unitsByProduct.values()) / totalUnits : 0;

  const cut14 = daysAgoUtcMs(13);
  let belowCost = 0;
  for (const t of transactions) {
    if (t.type !== "SALE") continue;
    const product = t.productId ? byProduct.get(t.productId) : undefined;
    if (!product || product.costMinor <= 0) continue;
    if (t.unitPriceMinor !== null && t.unitPriceMinor < product.costMinor && new Date(t.createdAt).getTime() >= cut14) {
      belowCost += 1;
    }
  }

  return {
    capitalInGoodsMinor: capitalInGoods,
    parkedMinor,
    owedMinor: totalOwed(customers),
    monthTakeMinor: month.sales.amountMinor,
    monthCreditShare: month.sales.amountMinor > 0 ? month.creditMinor / month.sales.amountMinor : 0,
    weeksTakeMinor: salesThisWeek(transactions).amountMinor,
    avgDailyTakeMinor: Math.round(averageDailyTake(transactions)),
    topProductShare,
    belowCostRecentCount: belowCost,
    unknownCostGoodsCount: unknownCost,
  };
}

/** Same-day-point of the previous month: for "tracking ahead/behind". */
function sameSpanLastMonth(transactions: TransactionSummary[], now: Date): number {
  const y = now.getFullYear();
  const m = now.getMonth();
  const daysInPrev = new Date(y, m, 0).getDate();
  const prevStart = new Date(y, m - 1, 1).getTime();
  const prevCut = new Date(y, m - 1, Math.min(now.getDate(), daysInPrev) + 1).getTime();
  let sum = 0;
  for (const t of transactions) {
    if (t.type !== "SALE") continue;
    const ts = new Date(t.createdAt).getTime();
    if (ts >= prevStart && ts < prevCut) sum += t.amountMinor;
  }
  return sum;
}

/**
 * The advisor's deeper read: capital, cash-flow discipline and shape of the
 * business, shown on the full whisper screen. Framed as quiet advice, never
 * invented facts - each card is a real number from the ledger.
 */
export function advice(
  products: ProductSummary[],
  customers: CustomerSummary[],
  transactions: TransactionSummary[],
  now: Date = new Date(),
): WhisperCard[] {
  const h = businessHealth(products, customers, transactions, now);
  const candidates: { card: WhisperCard; score: number }[] = [];

  // Capital sitting on the shelf instead of working.
  if (h.capitalInGoodsMinor > 0 && h.parkedMinor > 0) {
    const share = h.parkedMinor / h.capitalInGoodsMinor;
    const heavy = share >= 0.3;
    candidates.push({
      score: 55 + Math.min(share * 45, 30),
      card: {
        id: "capital-parked",
        tone: heavy ? "danger" : "accent",
        icon: "bank-outline",
        title: heavy ? "A chunk of your money is parked" : "Some money is tied up on the shelf",
        body: `About ${Math.round(share * 100)}% of the money in your goods (${formatMoney(h.parkedMinor)}) hasn't moved in two weeks. A moving-day price turns it back into cash while it still can.`,
        action: { label: "Free it", path: "/inventory" },
      },
    });
  }

  // What customers owe, spoken in days of the owner's own pace.
  if (h.owedMinor > 0 && h.avgDailyTakeMinor > 0) {
    const days = Math.max(1, Math.round(h.owedMinor / h.avgDailyTakeMinor));
    candidates.push({
      score: 50 + Math.min(days * 4, 22),
      card: {
        id: "debt-days",
        tone: "gold",
        icon: "swap-vertical-outline",
        title: days === 1 ? "Owed money is a day's take" : `Owed money is about ${days} days of take`,
        body: `You're owed ${formatMoney(h.owedMinor)} - at your pace, that's roughly ${days} day${days === 1 ? "" : "s"} of sales, sitting in other people's pockets.`,
        action: { label: "See who owes", path: "/customers" },
      },
    });
  }

  // This month vs the same point last month.
  const lastMonth = sameSpanLastMonth(transactions, now);
  if (h.monthTakeMinor > 0 && lastMonth > 0) {
    const ahead = h.monthTakeMinor >= lastMonth;
    const pct = Math.round((Math.abs(h.monthTakeMinor - lastMonth) / lastMonth) * 100);
    candidates.push({
      score: 30,
      card: {
        id: ahead ? "ahead-month" : "behind-month",
        tone: "accent",
        icon: ahead ? "trending-up" : "trending-down",
        title: ahead ? "Tracking ahead of last month" : "Behind last month's pace",
        body: ahead
          ? `${formatMoney(h.monthTakeMinor)} so far, ${pct}% more than the ${formatMoney(lastMonth)} this point last month. Whatever you did last month, do more of it.`
          : `${formatMoney(h.monthTakeMinor)} so far - last month had ${formatMoney(lastMonth)} by now. ${pct}% is catchable with a stock pickup.`,
        action: { label: "See the month", path: "/report" },
      },
    });
  }

  // Sales drifting onto credit.
  if (h.monthCreditShare >= 0.35 && h.monthTakeMinor > 0) {
    candidates.push({
      score: 36 + Math.round(h.monthCreditShare * 40),
      card: {
        id: "credit-creep",
        tone: "gold",
        icon: "card-outline",
        title: "Sales are sliding onto credit",
        body: `Around ${Math.round(h.monthCreditShare * 100)}% of this month's take walked out on credit. Cash keeps the shop open - tighten the taps this week.`,
        action: { label: "This week's sales", path: "/sales" },
      },
    });
  }

  // One product carrying everything.
  if (h.topProductShare >= 0.6 && h.topProductShare < 1) {
    candidates.push({
      score: 26 + Math.round(h.topProductShare * 30),
      card: {
        id: "one-basket",
        tone: "accent",
        icon: "layers-outline",
        title: "One product is carrying the shop",
        body: `${Math.round(h.topProductShare * 100)}% of this month's units is a single product. When it pauses, the whole shop feels it - give the shelf a companion.`,
        action: { label: "Browse inventory", path: "/inventory" },
      },
    });
  }

  // Selling below cost.
  if (h.belowCostRecentCount > 0) {
    candidates.push({
      score: 40 + h.belowCostRecentCount * 5,
      card: {
        id: "below-cost",
        tone: "danger",
        icon: "warning-outline",
        title: "Some sales are running at a loss",
        body: `${h.belowCostRecentCount} sale${h.belowCostRecentCount === 1 ? "" : "s"} in the last two weeks went below your cost price. Set a floor on those margins in inventory.`,
        action: { label: "Check margins", path: "/inventory" },
      },
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, 4).map((c) => c.card);
}