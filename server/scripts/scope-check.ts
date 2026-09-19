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
  const tenantA = await mkTenant("Scope-A");
  const tenantB = await mkTenant("Scope-B");

  try {
    const a = tenantScoped(tenantA.id);
    const b = tenantScoped(tenantB.id);

    // Creates: tenantId NOT in the input, so stamping is what makes these work.
    const rose = await a.product.create({
      data: { name: "Rose Gold", priceMinor: 12500, costMinor: 8000 },
    });
    await a.product.create({
      data: { name: "Oud Intense", priceMinor: 16000, costMinor: 10500 },
    });
    await b.product.createMany({
      data: [
        { name: "Mint Soap", priceMinor: 2500, costMinor: 1200 },
        { name: "Lemon Soap", priceMinor: 2500, costMinor: 1200 },
      ],
    });

    assert.equal((await a.product.count()), 2, "A should see exactly its own 2 products");
    pass("scoped(A).product.count() == 2 (stamped on create + createMany)");

    const stored = await db.product.findUnique({ where: { id: rose.id } });
    assert.equal(stored?.tenantId, tenantA.id, "created row must carry tenant A's id");
    pass("created rows carry the scoping tenant's tenantId");

    assert.equal((await b.product.count()), 2, "B should see exactly its own 2 products");
    pass("scoped(B).product.count() == 2, isolated from A's data");

    assert.equal((await db.product.count()), 4, "DB total should be 4 between both");
    pass("unscoped total == 4 (rows really persisted)");

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

    for (const op of ["update", "delete"] as const) {
      try {
        await b.product[op]({ where: { id: rose.id }, data: { name: "HACKED" } });
        throw new Error(`expected scoped ${op}() to be rejected`);
      } catch (err) {
        assert.match(
          String(err),
          new RegExp(`use ${op}Many`),
          `scoped ${op}() must refuse to run`,
        );
        pass(`scoped ${op}() is rejected loudly (use ${op}Many with id in where)`);
      }
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