import { AppState } from "react-native";
import Storage from "expo-sqlite/kv-store";

import { ApiError } from "./api";
import { CustomerSummary, ProductSummary, TransactionSummary } from "./types";

// ---------------------------------------------------------------------------
// Phase 5 - the offline layer.
//
// Three pieces work together:
//  - MIRROR:   the last-good server snapshot of products / customers /
//              transactions, persisted as JSON blobs in SQLite. While offline,
//              every list read is served from here.
//  - OUTBOX:   a queue of mutations (sale, payment, restock/adjust) made while
//              offline. Each carries the idempotencyKey it was FIRST attempted
//              with, so replaying it after a reconnect can never double-apply
//              (the server dedupes by key).
//  - SYNC:     on a successful request, on app start, and when the app comes
//              back to the foreground, the outbox is flushed and the mirror is
//              re-captured from the server.
//
// v1 boundaries (deliberate): creating/editing products or customers while
// offline is NOT supported - new items use server ids that referenced rows
// (sales) depend on. The api() layer rejects those writes with a clear
// "needs a connection" message. Offline writes are the shop-floor operations:
// record a sale, record a payment, restock, adjust stock.
// ---------------------------------------------------------------------------

type Mirror = {
  syncedAt: string | null;
  products: { products: ProductSummary[] } | null;
  customers: { customers: CustomerSummary[] } | null;
  transactions: { transactions: TransactionSummary[] } | null;
};

export type OutboxRow = {
  id: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
  idempotencyKey: string;
  createdAt: string;
  error?: string;
};

const MIRROR_KEY = "oloja/mirror";
const OUTBOX_KEY = "oloja/outbox";

const emptyMirror = (): Mirror => ({
  syncedAt: null,
  products: null,
  customers: null,
  transactions: null,
});

let mirror: Mirror = emptyMirror();
let outbox: OutboxRow[] = [];
let booted = false;
let online = true;
let syncing = false;

type SyncStatus = {
  online: boolean;
  pending: number;
  syncedAt: string | null;
  lastError: string | null;
};

function status(): SyncStatus {
  const failed = outbox.find((row) => row.error);
  return {
    online,
    pending: outbox.filter((row) => !row.error).length,
    syncedAt: mirror.syncedAt,
    lastError: failed?.error ?? null,
  };
}

const listeners = new Set<() => void>();
export function subscribeSync(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function notify() {
  for (const cb of listeners) cb();
}

// Distinct from the status listeners above: fires only when a sync round
// finishes successfully (the outbox drained and the mirror re-captured). The
// UI uses it to refetch data from the freshly-synced store WITHOUT causing an
// invalidation loop (status() also changes on every list capture).
const syncCompleteListeners = new Set<() => void>();
export function subscribeSyncComplete(cb: () => void): () => void {
  syncCompleteListeners.add(cb);
  return () => syncCompleteListeners.delete(cb);
}
function notifySyncComplete() {
  for (const cb of syncCompleteListeners) cb();
}

const pendingLocalId = () =>
  `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export function hasMirror(): boolean {
  return mirror.products !== null;
}

export function getSyncStatus(): SyncStatus {
  return status();
}

export function setOnline(value: boolean) {
  if (online === value) return;
  online = value;
  notify();
}

export async function bootOffline(): Promise<void> {
  if (booted) return;
  booted = true;
  const [rawMirror, rawOutbox] = await Promise.all([
    Storage.getItemAsync(MIRROR_KEY),
    Storage.getItemAsync(OUTBOX_KEY),
  ]);
  try {
    if (rawMirror) mirror = { ...emptyMirror(), ...JSON.parse(rawMirror) };
  } catch {
    mirror = emptyMirror();
  }
  try {
    if (rawOutbox) outbox = JSON.parse(rawOutbox) as OutboxRow[];
  } catch {
    outbox = [];
  }
  // A leftover outbox means the last session never finished syncing.
  if (outbox.length > 0) online = false;
}

async function persist(): Promise<void> {
  await Promise.all([
    Storage.setItemAsync(MIRROR_KEY, JSON.stringify(mirror)),
    Storage.setItemAsync(OUTBOX_KEY, JSON.stringify(outbox)),
  ]);
}

// A fresh login/registration belongs to a (possibly different) shop: every
// trace of the previous tenant's data on THIS device must go. Also called on
// sign out, so the next shop to use the device starts clean.
export async function resetOffline(): Promise<void> {
  mirror = emptyMirror();
  outbox = [];
  online = true;
  await persist();
  notify();
}

// ---- Mirror capture --------------------------------------------------------

export function captureLists(
  products: { products: ProductSummary[] } | null,
  customers: { customers: CustomerSummary[] } | null,
  transactions: { transactions: TransactionSummary[] } | null,
): void {
  if (products) mirror.products = products;
  if (customers) mirror.customers = customers;
  if (transactions) mirror.transactions = transactions;
  mirror.syncedAt = new Date().toISOString();
  void persist();
  notify();
}

// ---- Local (offline) reads --------------------------------------------------

function productsList(): ProductSummary[] {
  return mirror.products?.products ?? [];
}
function customersList(): CustomerSummary[] {
  return mirror.customers?.customers ?? [];
}
function transactionsList(): TransactionSummary[] {
  return mirror.transactions?.transactions ?? [];
}

function localReadOrNull(path: string): unknown {
  if (path === "/api/products") return mirror.products;
  if (path === "/api/customers") return mirror.customers;
  if (path === "/api/transactions") return mirror.transactions;

  const productMatch = path.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch) {
    const product = productsList().find((p) => p.id === productMatch[1]);
    return product ? { ...product } : undefined;
  }

  const customerMatch = path.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch) {
    const customer = customersList().find((c) => c.id === customerMatch[1]);
    return customer ? { ...customer } : undefined;
  }

  const debtMatch = path.match(/^\/api\/customers\/([^/]+)\/debt$/);
  if (debtMatch) {
    const id = debtMatch[1];
    if (!customersList().some((c) => c.id === id)) return undefined;
    const entries = transactionsList()
      .filter((t) => t.customerId === id)
      .map((t): { id: string; type: string; amountMinor: number; note: string | null; transactionId: string | null; createdAt: string } =>
        t.type === "SALE"
          ? { id: t.id, type: "CREDIT", amountMinor: t.onCredit ? t.amountMinor : 0, note: t.note, transactionId: t.id, createdAt: t.createdAt }
          : { id: t.id, type: "PAYMENT", amountMinor: -(t.amountMinor), note: t.note, transactionId: t.id, createdAt: t.createdAt },
      )
      .filter((e) => e.amountMinor !== 0);
    const debtMinor = entries.reduce((sum, e) => sum + e.amountMinor, 0);
    return { entries, debtMinor };
  }

  const movementsMatch = path.match(/^\/api\/products\/([^/]+)\/movements$/);
  if (movementsMatch) {
    if (!productsList().some((p) => p.id === movementsMatch[1])) return undefined;
    return { movements: [] };
  }

  return undefined;
}

export function localRead(path: string): unknown | undefined {
  if (!hasMirror()) return undefined;
  return localReadOrNull(path);
}

// ---- Local (offline) mutations ---------------------------------------------

function unreachable(message: string): ApiError {
  return new ApiError(400, message);
}

// Simulates what the server would have returned, applying the write to the
// mirror so offline screens stay correct. Throws an ApiError for writes that
// v1 deliberately does not allow offline (new/edited entities) or that the
// local mirror proves invalid (e.g. selling more than we have locally).
function simulateMutation(
  method: string,
  path: string,
  body: Record<string, unknown>,
): unknown {
  const id = pendingLocalId();
  const now = new Date().toISOString();

  if (path === "/api/products" || path === "/api/customers") {
    throw unreachable(
      "You're offline. Creating new items needs a connection - try again in a moment.",
    );
  }
  const patchMatch = path.match(/^\/api\/(products|customers)\//);
  if (patchMatch && method === "PATCH") {
    throw unreachable(
      "You're offline. Editing items needs a connection - try again in a moment.",
    );
  }

  if (path === "/api/sales") {
    const productId = String(body.productId);
    const quantity = Number(body.quantity);
    const customerId = body.customerId ? String(body.customerId) : null;
    const onCredit = Boolean(body.onCredit);
    if (onCredit && !customerId) throw unreachable("An on-credit sale needs a customerId");

    const product = productsList().find((p) => p.id === productId);
    if (!product) throw unreachable("Product not found");
    if (customerId && !customersList().some((c) => c.id === customerId)) {
      throw unreachable("Customer not found");
    }
    if (product.stockQty < quantity) {
      throw unreachable(
        `Not enough stock (${product.stockQty} available) - sync before selling more.`,
      );
    }

    const unitPriceMinor = Number(body.unitPriceMinor ?? product.priceMinor);
    const amountMinor = quantity * unitPriceMinor;

    product.stockQty -= quantity;
    if (onCredit && customerId) {
      const customer = customersList().find((c) => c.id === customerId);
      if (customer) customer.debtMinor += amountMinor;
    }

    const transaction: TransactionSummary = {
      id,
      type: "SALE",
      customerId,
      productId,
      quantity,
      unitPriceMinor,
      amountMinor,
      onCredit,
      note: body.note ? String(body.note) : null,
      createdAt: now,
      product: { name: product.name },
      customer: customerId
        ? { name: customersList().find((c) => c.id === customerId)?.name ?? "" }
        : null,
    };
    transactionsList().unshift(transaction);
    void persist();
    return { transaction, stockQty: product.stockQty };
  }

  if (path === "/api/payments") {
    const customerId = String(body.customerId);
    const amountMinor = Number(body.amountMinor);
    const customer = customersList().find((c) => c.id === customerId);
    if (!customer) throw unreachable("Customer not found");
    if (customer.debtMinor <= 0) throw unreachable("This customer has no outstanding debt to pay");

    customer.debtMinor = Math.max(customer.debtMinor - amountMinor, 0);
    const transaction: TransactionSummary = {
      id,
      type: "PAYMENT",
      customerId,
      productId: null,
      quantity: 0,
      unitPriceMinor: null,
      amountMinor,
      onCredit: false,
      note: body.note ? String(body.note) : null,
      createdAt: now,
      product: null,
      customer: { name: customer.name },
    };
    transactionsList().unshift(transaction);
    void persist();
    return { transaction, debtMinor: customer.debtMinor };
  }

  const stockMatch = path.match(/^\/api\/products\/([^/]+)\/stock$/);
  if (stockMatch && method === "POST") {
    const productId = stockMatch[1];
    const product = productsList().find((p) => p.id === productId);
    if (!product) throw unreachable("Product not found");
    const type = String(body.type);
    const quantity = Number(body.quantity);
    if (type === "RESTOCK") {
      if (quantity <= 0) throw unreachable("RESTOCK quantity must be positive");
      if (body.unitCostMinor === undefined) throw unreachable("unitCostMinor is required for a RESTOCK");
      product.costMinor = Number(body.unitCostMinor);
    } else if (type === "ADJUST") {
      if (quantity === 0) throw unreachable("ADJUST quantity cannot be zero");
    } else {
      throw unreachable("Invalid input");
    }
    product.stockQty += quantity;
    void persist();
    return {
      movement: {
        id,
        type,
        quantity,
        unitCostMinor: body.unitCostMinor ?? product.costMinor,
        note: body.note ? String(body.note) : null,
        createdAt: now,
      },
      stockQty: product.stockQty,
    };
  }

  throw unreachable("This action needs a connection right now.");
}

export function enqueueAndSimulate(
  method: string,
  path: string,
  body: Record<string, unknown>,
  idempotencyKey: string,
): unknown {
  const simulated = simulateMutation(method, path, body);
  outbox.push({
    id: pendingLocalId(),
    method,
    path,
    body: { ...body, idempotencyKey },
    idempotencyKey,
    createdAt: new Date().toISOString(),
  });
  void persist();
  notify();
  return simulated;
}

// ---- Sync ------------------------------------------------------------------

// The raw executor is injected by api.ts (a real fetch that never falls back
// to the mirror) so offline.ts does not import fetch logic itself.
export type SyncExecutor = <T>(
  method: string,
  path: string,
  body?: unknown,
) => Promise<T>;

async function flushOutbox(executor: SyncExecutor): Promise<boolean> {
  const queue = [...outbox];
  for (const row of queue) {
    try {
      // The server dedupes on idempotencyKey, so a row sent twice can never
      // double-apply. After this loop requestSync() re-captures the mirror
      // from the server, so no local folding is needed here.
      await executor(row.method, row.path, row.body);
      outbox = outbox.filter((r) => r.id !== row.id);
    } catch (err) {
      if (err instanceof ApiError) {
        // The server saw the request and refused it (e.g. out of stock).
        // Keep the row, flag the message, and move on with the rest.
        row.error = err.message;
      } else {
        // Real network failure: stop flushing, stay offline, retry later.
        setOnline(false);
        void persist();
        return false;
      }
    }
  }
  void persist();
  notify();
  return true;
}

export async function requestSync(executor: SyncExecutor): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    const ok = await flushOutbox(executor);
    if (!ok) return;
    setOnline(true);
    // Re-capture the truth now that the server has absorbed the outbox.
    const [products, customers, transactions] = await Promise.all([
      executor<{ products: ProductSummary[] }>("GET", "/api/products").catch(() => null),
      executor<{ customers: CustomerSummary[] }>("GET", "/api/customers").catch(() => null),
      executor<{ transactions: TransactionSummary[] }>("GET", "/api/transactions").catch(() => null),
    ]);
    if (products || customers || transactions) {
      captureLists(products, customers, transactions);
    }
    notifySyncComplete();
  } finally {
    syncing = false;
  }
}

// ---- Lifecycle: retry when the app returns to the foreground ----------------

let registered = false;
export function registerLifecycleSync(executor: SyncExecutor): void {
  if (registered) return;
  registered = true;
  AppState.addEventListener("change", (state) => {
    if (state === "active") void requestSync(executor);
  });
}