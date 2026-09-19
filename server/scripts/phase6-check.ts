// Live smoke test for Phase 6 (multi-shop onboarding):
//  - register creates an OWNER membership
//  - owner mints an invite code; a second account accepts it -> STAFF
//  - STAFF is blocked from owner-only actions (products, role changes)
//  - VIEW is blocked from ALL mutations (sales)
//  - /auth/switch-shop rescopes a token to another of the user's shops
//  - role change + member removal work, owner can't remove self
// Run with `npm run phase6:check` (start the dev server first).
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
const tenantIds: string[] = [];

try {
  console.log("1. Owner registers...");
  const owner = await api("/auth/register", {
    method: "POST",
    body: { tenantName: `Shop6-${stamp}`, ownerName: "Owner Six", email: `own6-${stamp}@example.com`, password: "password123" },
  });
  check("owner register -> token", owner.status === 201 && Boolean(owner.json.token));
  tenantIds.push(owner.json.tenant.id);
  check("owner: tenants -> 1 OWNER", owner.json.tenants?.length === 1 && owner.json.tenants[0].role === "OWNER");
  const ownerToken = owner.json.token;

  console.log("2. Invite flow...");
  const inv0 = await api("/api/invites", { token: ownerToken });
  check("owner sees no invite yet", inv0.json.invite === null);
  check("owner sees 1 member (self)", inv0.json.members?.length === 1 && inv0.json.members[0].role === "OWNER");

  const inv = await api("/api/invites", { method: "POST", token: ownerToken, body: {} });
  check("owner minted a code", inv.status === 201 && /^[A-Z2-9]{8}$/.test(inv.json.code ?? ""));
  const code = inv.json.code;

  const inv2 = await api("/api/invites", { method: "POST", token: ownerToken, body: {} });
  check("regenerate supersedes old code", inv2.status === 201 && inv2.json.code !== code);
  const code2 = inv2.json.code;

  console.log("3. Second account enters via code...");
  const staffReg = await api("/auth/register", {
    method: "POST",
    body: { tenantName: `Shop6b-${stamp}`, ownerName: "Staff Six", email: `staff6-${stamp}@example.com`, password: "password123" },
  });
  tenantIds.push(staffReg.json.tenant.id);
  const staffToken = staffReg.json.token;

  const stale = await api("/api/invites/accept", { method: "POST", body: { code }, token: staffToken });
  check("old code is dead after regenerate", stale.status === 404);

  const accept = await api("/api/invites/accept", { method: "POST", body: { code: code2 }, token: staffToken });
  check("accept -> STAFF in that shop", accept.status === 201 && accept.json.role === "STAFF");
  const again = await api("/api/invites/accept", { method: "POST", body: { code: code2 }, token: staffToken });
  check("same code refused twice", again.status === 410);

  console.log("4. Switch-shop...");
  const switched = await api("/auth/switch-shop", { method: "POST", token: staffToken, body: { tenantId: owner.json.tenant.id } });
  check("switch-shop -> token for joined shop", switched.status === 200 && switched.json.tenant.id === owner.json.tenant.id);
  const staffTenant1Token = switched.json.token;
  const badSwitch = await api("/auth/switch-shop", { method: "POST", token: staffToken, body: { tenantId: "cmxx00000000000000000000" } });
  check("switch to non-member shop refused (403)", badSwitch.status === 403);

  const meStaff = await api("/auth/me", { token: staffTenant1Token });
  check("me: lists both shops", meStaff.json.tenants?.length === 2);

  console.log("5. Staff is restricted in the joined shop...");
  const staffProbe = await api("/api/products", { method: "POST", token: staffTenant1Token, body: { name: "Staff Product", priceMinor: 5000, costMinor: 2000 } });
  check("STAFF cannot create products (403)", staffProbe.status === 403);
  const invitesAsStaff = await api("/api/invites", { token: staffTenant1Token });
  check("STAFF cannot open invite management (403)", invitesAsStaff.status === 403);

  console.log("6. Roles...");
  const memberList = await api("/api/invites", { token: ownerToken });
  const staffMember = memberList.json.members.find((m: any) => m.email === staffReg.json.user.email);
  check("owner sees the new staff member", Boolean(staffMember));

  const demote = await api(`/api/invites/members/${staffMember.id}`, {
    method: "PATCH",
    token: ownerToken,
    body: { role: "VIEW" },
  });
  check("owner changed STAFF -> VIEW", demote.status === 200 && demote.json.role === "VIEW");
  const viewSale = await api("/api/sales", { method: "POST", token: staffTenant1Token, body: { productId: "x", quantity: 1 } });
  check("VIEW cannot post a sale (403)", viewSale.status === 403);

  const ownerMember = memberList.json.members.find((m: any) => m.role === "OWNER");
  const demoteOwner = await api(`/api/invites/members/${ownerMember.id}`, {
    method: "PATCH",
    token: ownerToken,
    body: { role: "VIEW" },
  });
  check("owner's own role can't be changed (400)", demoteOwner.status === 400);
  const removeSelf = await api(`/api/invites/members/${ownerMember.id}`, { method: "DELETE", token: ownerToken });
  check("owner can't remove self (400)", removeSelf.status === 400);

  const removeStaff = await api(`/api/invites/members/${staffMember.id}`, { method: "DELETE", token: ownerToken });
  check("owner removed the staff member", removeStaff.status === 200);
  const recheck = await api("/api/invites", { token: ownerToken });
  check("owner only member again", recheck.json.members?.length === 1);

  console.log("7. Second shop still works after removal...");
  const ownShop = await api("/auth/switch-shop", { method: "POST", token: staffToken, body: { tenantId: staffReg.json.tenant.id } });
  check("staff still owns their own shop", ownShop.status === 200 && ownShop.json.tenant.id === staffReg.json.tenant.id);
} finally {
  if (tenantIds.length) {
    await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    console.log("Cleaned up test tenants.");
  }
  await db.$disconnect();
}

console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);