// Live smoke test for idempotency keys (Phase 5 offline support).
// Creates a throwaway tenant, then proves that re-sending a mutation with the
// SAME idempotencyKey applies it only once: same entity id, same stored
// response, ledger totals bumped exactly once. Tenants are deleted afterwards.
// Run with `npm run idempotency:check` (start the dev server first).
import "dotenv/config";

import { db } from "../src/lib/db.js";

const base = process.env.API_BASE_URL ?? "http://localhost:4000";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ""}`);
  }
}

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {},
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const stamp = Date.now();
const tenantName = `Idp-${stamp}`;
let tenantId: string | null = null;

try {
  console.log("Registering throwaway tenant...");
  const reg = await api("/auth/register", {
    method: "POST",
    body: {
      tenantName,
      ownerName: "Idempotency Tester",
      email: `idp-${stamp}@example.com`,
      password: "password123",
    },
  });
  if (reg.status !== 201 || !reg.json.token) {
    throw new Error(`register failed: ${JSON.stringify(reg.json)}`);
  }
  tenantId = reg.json.tenant.id;
  const token = reg.json.token as string;
  check("register → token", Boolean(token));

  const keyFor = (tag: string) => `${tag}-${stamp}`;
  const KEY = keyFor("op1"); // product create
  const RESTOCK_KEY = keyFor("op2");
  const CUSTOMER_KEY = keyFor("op3");
  const SALE_KEY = keyFor("op4");
  const PAYMENT_KEY = keyFor("op5");

  // --- Product create: same key twice ---
  const productBody = {
    name: "Replay Scent 50ml",
    priceMinor: 10000,
    costMinor: 6000,
    idempotencyKey: KEY,
  };
  const p1 = await api("/api/products", { method: "POST", body: productBody, token });
  const p2 = await api("/api/products", { method: "POST", body: productBody, token });
  check("product create: 201 both times", p1.status === 201 && p2.status === 201);
  check("product create: same id on replay", p1.json.id === p2.json.id);
  const productId = p1.json.id;
  const list1 = await api("/api/products", { token });
  check("product list: 1 product despite 2 sends", list1.json.products.length === 1);

  // --- Restock: same key once, new key again ---
  const restockBody = { type: "RESTOCK", quantity: 5, unitCostMinor: 6000, idempotencyKey: RESTOCK_KEY };
  const r1 = await api(`/api/products/${productId}/stock`, {
    method: "POST",
    body: restockBody,
    token,
  });
  const r2 = await api(`/api/products/${productId}/stock`, {
    method: "POST",
    body: restockBody,
    token,
  });
  check("restock: same movement id on replay", r1.json.movement?.id === r2.json.movement?.id);
  check("restock: stock applied once (5)", r1.json.stockQty === 5 && r2.json.stockQty === 5);
  const r3 = await api(`/api/products/${productId}/stock`, {
    method: "POST",
    body: { ...restockBody, idempotencyKey: keyFor("op6") },
    token,
  });
  check("restock: fresh key applies again (10)", r3.json.stockQty === 10);

  // --- Customer create: same key twice ---
  const custBody = { name: "Replay Customer", phone: "08000000000", idempotencyKey: CUSTOMER_KEY };
  const c1 = await api("/api/customers", { method: "POST", body: custBody, token });
  const c2 = await api("/api/customers", { method: "POST", body: custBody, token });
  check("customer create: same id on replay", c1.json.id === c2.json.id);
  const customerId = c1.json.id;
  const listC = await api("/api/customers", { token });
  check("customer list: 1 customer despite 2 sends", listC.json.customers.length === 1);

  // --- On-credit sale: same key twice ---
  const saleBody = {
    productId,
    quantity: 1,
    customerId,
    onCredit: true,
    unitPriceMinor: 10000,
    idempotencyKey: SALE_KEY,
  };
  const s1 = await api("/api/sales", { method: "POST", body: saleBody, token });
  const s2 = await api("/api/sales", { method: "POST", body: saleBody, token });
  check("sale: same transaction id on replay", s1.json.transaction?.id === s2.json.transaction?.id);
  check("sale: stock taken once (9)", s1.json.stockQty === 9 && s2.json.stockQty === 9);
  const txList = await api("/api/transactions", { token });
  const sales = txList.json.transactions.filter((t: any) => t.type === "SALE");
  check("transactions: 1 SALE row", sales.length === 1, JSON.stringify(txList.json.transactions));
  const debt = await api(`/api/customers/${customerId}/debt`, { token });
  check("debt: credited once (10000)", debt.json.debtMinor === 10000);

  // --- Payment: same key twice ---
  const payBody = { customerId, amountMinor: 4000, idempotencyKey: PAYMENT_KEY };
  const pm1 = await api("/api/payments", { method: "POST", body: payBody, token });
  const pm2 = await api("/api/payments", { method: "POST", body: payBody, token });
  check("payment: same id on replay", pm1.json.transaction?.id === pm2.json.transaction?.id);
  const debt2 = await api(`/api/customers/${customerId}/debt`, { token });
  check("debt: paid once (6000 left)", debt2.json.debtMinor === 6000);

  // --- Fresh key (no replay) still behaves like a normal call ---
  const fresh = await api("/api/sales", {
    method: "POST",
    body: { productId, quantity: 1, unitPriceMinor: 10000 },
    token,
  });
  check("no key: plain sale still works (8 left)", fresh.status === 201 && fresh.json.stockQty === 8);
} finally {
  if (tenantId) {
    await db.tenant.deleteMany({ where: { id: tenantId } });
    console.log("Cleaned up test tenant.");
  }
  await db.$disconnect();
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);