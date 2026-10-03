// Proves tenant isolation on a real database: run with `npm run scope:check`.
// Creates two throwaway tenants, writes products through tenantScoped(), and
// verifies neither side can read, update, or delete the other's rows.
import "dotenv/config";

import assert from "node:assert/strict";

import { db } from "../src/lib/db.js";
import { tenantScoped } from "../src/lib/scoped.js";

const suffix = Date.now().toString().slice(-8);
const mkTenant = (name: string) =>
  db.tenant.create({ data: { name: `${name}-${suffix}` } });

function pass(label: string) {
  console.log(`PASS  ${label}`);
}

async function main() {
  const totalBefore = await db.product.count();
  const tenantA = await mkTenant("Scope-A");
  const tenantB = await mkTenant("Scope-B");

  try {
    const a = tenantScoped(tenantA.id);
    const b = tenantScoped(tenantB.id);

    // Creates: we deliberately pass a SPOOFED tenantId. The hook must
    // overwrite it with the scoped tenant, so this also proves a caller can
    // never smuggle a row into someone else's shop.
    const spoof = "spoofed-tenant-id";
    const rose = await a.product.create({
      data: { tenantId: spoof, name: "Rose Gold", priceMinor: 12500, costMinor: 8000 },
    });
    await a.product.create({
      data: { tenantId: spoof, name: "Oud Intense", priceMinor: 16000, costMinor: 10500 },
    });
    await b.product.createMany({
      data: [
        { tenantId: spoof, name: "Mint Soap", priceMinor: 2500, costMinor: 1200 },
        { tenantId: spoof, name: "Lemon Soap", priceMinor: 2500, costMinor: 1200 },
      ],
    });

    assert.equal((await a.product.count()), 2, "A should see exactly its own 2 products");
    pass("scoped(A).product.count() == 2 (stamped on create + createMany)");

    const stored = await db.product.findUnique({ where: { id: rose.id } });
    assert.equal(stored?.tenantId, tenantA.id, "created row must carry tenant A's id");
    pass("created rows carry the scoping tenant's tenantId");

    const smuggled = await db.product.count({ where: { tenantId: spoof } });
    assert.equal(smuggled, 0, "no row may keep the spoofed tenantId");
    pass("a spoofed tenantId in the input is overwritten by the hook");

    assert.equal((await b.product.count()), 2, "B should see exactly its own 2 products");
    pass("scoped(B).product.count() == 2, isolated from A's data");

    assert.equal((await db.product.count()), totalBefore + 4, "DB total should grow by our 4");
    pass("unscoped total grows by exactly our 4 rows (relative, not absolute)");

    const notFound = await b.product.findFirst({ where: { id: rose.id } });
    assert.equal(notFound, null, "B must not read A's product by id");
    pass("cross-tenant findFirst by id returns null");

    try {
      await b.product.findUnique({ where: { id: rose.id } });
      throw new Error("expected scoped findUnique() to be rejected");
    } catch (err) {
      assert.match(String(err), /use findFirst\(\)/, "scoped findUnique must refuse to run");
      pass("scoped findUnique() is rejected loudly (use findFirst instead)");
    }

    try {
      await b.product.update({ where: { id: rose.id }, data: { name: "HACKED" } });
      throw new Error("expected scoped update() to be rejected");
    } catch (err) {
      assert.match(String(err), /use updateMany/, "scoped update must refuse to run");
      pass("scoped update() is rejected loudly (use updateMany with id in where)");
    }

    try {
      await b.product.delete({ where: { id: rose.id } });
      throw new Error("expected scoped delete() to be rejected");
    } catch (err) {
      assert.match(String(err), /use deleteMany/, "scoped delete must refuse to run");
      pass("scoped delete() is rejected loudly (use deleteMany with id in where)");
    }

    const hack = await b.product.updateMany({ where: { id: rose.id }, data: { name: "HACKED" } });
    assert.equal(hack.count, 0, "B must not be able to update A's product");
    pass("scoped updateMany() with id cannot touch A's product (0 rows)");

    const gone = await b.product.deleteMany({ where: { id: rose.id } });
    assert.equal(gone.count, 0, "B must not be able to delete A's product");
    pass("scoped deleteMany() with id cannot touch A's product (0 rows)");

    const intact = await a.product.findFirst({ where: { id: rose.id } });
    assert.equal(intact?.name, "Rose Gold", "A's product must be untouched");
    pass("A's product untouched after B's failed update/delete");

    const aItems = await a.product.findMany({ orderBy: { name: "asc" } });
    assert.deepEqual(
      aItems.map((p) => p.name),
      ["Oud Intense", "Rose Gold"],
      "A sees exactly its own list",
    );
    pass("scoped(A).product.findMany() returns only A's products");

    // Critical for sales: money moves must be atomic (a $transaction). If the
    // tenant-injection hooks did NOT fire inside interactive transactions, an
    // atomic write could silently touch the wrong tenant. So assert they do.
    let txCount = -1;
    await a.$transaction(async (tx) => {
      txCount = await tx.product.count({ where: {} });
    });
    assert.equal(txCount, 2, "scoped hooks must run inside $transaction (2, not 4)");
    pass("scoped hooks fire inside interactive $transaction (tx sees only A's rows)");

    console.log("\nAll tenant-isolation checks passed.");
  } finally {
    await db.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error("\nFAIL  ", err);
  process.exitCode = 1;
});