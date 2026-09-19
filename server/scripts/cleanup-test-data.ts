// Deletes throwaway tenants created by live API smoke tests so the database
// stays clean. Run with `npm run db:clean`. Keeps the real test account
// ("Test Perfume Shop") used for mobile login.
import "dotenv/config";

import { db } from "../src/lib/db.js";

const result = await db.tenant.deleteMany({
  where: { name: { startsWith: "Inv-" } },
});

console.log(`Deleted ${result.count} smoke-test tenant(s).`);
await db.$disconnect();