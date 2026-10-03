import { api } from "./api";
import { ApiError } from "./errors";
import { stockCounts, totalOwed } from "./insights";
import { formatMoney } from "./money";
import type { CustomerSummary, ProductSummary, TransactionSummary } from "./types";
import { advice, businessHealth } from "./whisper";

/**
 * "The week in a paragraph."
 *
 * The numbers are always ours: businessHealth/advice already read the ledger
 * on-device (and work with no network at all). The server is asked only to
 * reword that same set of facts, and it may not add a figure - see
 * server/src/lib/ai.ts. If the server has no key, is offline, or breaks its own
 * grounding rule, localLetter() below is used instead, so this screen is never
 * empty and never costs money to read.
 */

export type LetterSource = "model" | "local";

export type WeeklyLetter = {
  letter: string;
  source: LetterSource;
  /** The facts the letter is allowed to talk about, shown under it. */
  facts: string[];
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** The same numbers, rendered as lines the model may quote. */
export function letterFacts(
  products: ProductSummary[],
  customers: CustomerSummary[],
  transactions: TransactionSummary[],
  now: Date = new Date(),
): string[] {
  const h = businessHealth(products, customers, transactions, now);
  const stock = stockCounts(products);
  const facts: string[] = [];

  facts.push(`Sales in the last 7 days: ${formatMoney(h.weeksTakeMinor)}`);
  facts.push(`Average sales per day: ${formatMoney(h.avgDailyTakeMinor)}`);
  facts.push(`Sales so far this month: ${formatMoney(h.monthTakeMinor)}`);
  if (h.monthTakeMinor > 0) {
    facts.push(`Share of this month's sales taken on credit: ${pct(h.monthCreditShare)}`);
  }
  if (h.topProductShare > 0) {
    facts.push(`Best seller's share of this month's units: ${pct(h.topProductShare)}`);
  }
  if (stock.onHand > 0) {
    facts.push(
      `Products on the shelf: ${stock.onHand}, of which ${stock.out} are out of stock and ${stock.low} are at or below their restock limit`,
    );
  }
  if (h.parkedMinor > 0) {
    facts.push(`Money sitting on goods that have not moved in a fortnight: ${formatMoney(h.parkedMinor)}`);
  }
  const owed = totalOwed(customers);
  if (owed > 0) {
    facts.push(`Money customers owe the shop: ${formatMoney(owed)}`);
  }
  if (h.belowCostRecentCount > 0) {
    facts.push(`Sales in the last fortnight that went below cost price: ${h.belowCostRecentCount}`);
  }

  return facts;
}

/** The advice lines as prose, so the letter and the model prompt quote the same
 *  words the cards on screen do. */
export function letterAdvice(
  products: ProductSummary[],
  customers: CustomerSummary[],
  transactions: TransactionSummary[],
  now: Date = new Date(),
): string[] {
  return advice(products, customers, transactions, now).map((c) => `${c.title}. ${c.body}`);
}

/** Deterministic letter: no model, no network, same numbers. */
export function localLetter(
  products: ProductSummary[],
  customers: CustomerSummary[],
  transactions: TransactionSummary[],
  now: Date = new Date(),
): string {
  const h = businessHealth(products, customers, transactions, now);
  const stock = stockCounts(products);
  const tips = advice(products, customers, transactions, now);

  const parts: string[] = [];
  parts.push(
    `This week the shop took ${formatMoney(h.weeksTakeMinor)}, averaging ${formatMoney(h.avgDailyTakeMinor)} a day.`,
  );

  if (h.monthTakeMinor > 0) {
    parts.push(`This month is at ${formatMoney(h.monthTakeMinor)} so far.`);
  }
  if (stock.out > 0 || stock.low > 0) {
    parts.push(
      `${stock.out === 0 ? "Nothing is" : `${stock.out} ${stock.out === 1 ? "product is" : "products are"}`} fully out of stock, and ${stock.low} ${stock.low === 1 ? "sits" : "sit"} at or below the restock limit.`,
    );
  }
  const owed = totalOwed(customers);
  if (owed > 0) {
    parts.push(`Customers still owe ${formatMoney(owed)}.`);
  }
  const firstTip = tips[0];
  if (firstTip) {
    parts.push(`Next week, start here: ${firstTip.title.replace(/\.$/, "").toLowerCase()}.`);
  } else {
    parts.push("Nothing is on fire - keep the shelf moving the way it is.");
  }

  return parts.join(" ");
}

/**
 * Ask the server to reword the facts, falling back to the local letter. Returns
 * `source` so the UI can say which one you are reading.
 */
export async function weeklyLetter(
  products: ProductSummary[],
  customers: CustomerSummary[],
  transactions: TransactionSummary[],
  shopName?: string,
  now: Date = new Date(),
): Promise<WeeklyLetter> {
  const facts = letterFacts(products, customers, transactions, now);
  const tips = letterAdvice(products, customers, transactions, now);

  try {
    const result = await api<{ letter: string | null; source: LetterSource; configured: boolean }>(
      "/api/whisper/letter",
      { method: "POST", body: { shopName, facts, advice: tips } },
    );
    if (result.letter) return { letter: result.letter, source: "model", facts };
  } catch (err) {
    // Offline, or the route is not deployed yet: the local letter is the point
    // of this screen, so never surface the failure.
    if (!(err instanceof ApiError)) {
      return { letter: localLetter(products, customers, transactions, now), source: "local", facts };
    }
  }

  return { letter: localLetter(products, customers, transactions, now), source: "local", facts };
}