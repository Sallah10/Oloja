// Local demo mode. When EXPO_PUBLIC_USE_MOCK_API=true the real network is never
// touched: this module answers every request the app makes with believable,
// in-memory data shaped exactly like the server's responses. It exists so you
// can click through the whole app before your phone can reach the API.
// Flip the env variable back to false to talk to the real backend.

import { ApiError } from "./errors";
import { MembershipRole } from "./types";

type MockOptions = { method?: string; body?: unknown };

type MockProduct = {
  id: string;
  name: string;
  note: string | null;
  priceMinor: number;
  costMinor: number;
  lowStockThreshold: number;
  archived: boolean;
  createdAt: string;
  movements: MockMovement[];
};

type MockMovement = {
  id: string;
  productId: string;
  type: string;
  quantity: number;
  unitCostMinor: number;
  note: string | null;
  createdAt: string;
};

type MockCustomer = {
  id: string;
  name: string;
  phone: string | null;
  archived: boolean;
  createdAt: string;
};

type MockDebtEntry = {
  id: string;
  customerId: string;
  type: string;
  amountMinor: number;
  note: string | null;
  transactionId: string | null;
  createdAt: string;
};

type MockTransaction = {
  id: string;
  type: string;
  customerId: string | null;
  productId: string | null;
  quantity: number;
  unitPriceMinor: number | null;
  amountMinor: number;
  onCredit: boolean;
  note: string | null;
  createdAt: string;
};

let seq = 0;
const nid = (prefix: string) => `${prefix}-${++seq}`;

// Invite codes mirror the server: 8 chars from an alphabet that skips
// I/O/0/1 so a handwritten code can't be misread as something else.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function mockInviteCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return code;
}
const iso = () => new Date().toISOString();

let seeded = false;
const products: MockProduct[] = [];
const customers: MockCustomer[] = [];
const debtEntries: MockDebtEntry[] = [];
const transactions: MockTransaction[] = [];
const registeredEmails = new Set<string>();

// Phase 6 demo state: the single demo account belongs to TWO shops so the
// switcher and roles are clickable without a real server. The ledger arrays
// above are shared by both shops - a demo simplification, not a server one.
type MockMembership = { tenantId: string; name: string; role: MembershipRole };
const mockMemberships: MockMembership[] = [
  { tenantId: "t-1", name: "The Perfume Stall", role: "OWNER" },
  { tenantId: "t-2", name: "Lagos Showroom", role: "STAFF" },
];
let mockActiveTenantId = "t-1";

let mockInvite: { code: string; expiresAt: string } | null = {
  code: "STALL7KD",
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
};

const mockMembers: { id: string; userId: string; name: string; email: string; role: MembershipRole; joinedAt: string }[] = [
  { id: "m-1", userId: "u-1", name: "Grace Okoro", email: "demo@oloja.app", role: "OWNER", joinedAt: iso() },
  { id: "m-2", userId: "u-2", name: "Ada Osei", email: "ada.osei@example.com", role: "STAFF", joinedAt: iso() },
];

function currentRole(): MembershipRole {
  return mockMemberships.find((m) => m.tenantId === mockActiveTenantId)?.role ?? "VIEW";
}

function deny(required: MembershipRole[]): never {
  throw new ApiError(403, "Forbidden");
}

function mockSession(email: string, tenantName?: string) {
  return {
    token: "mock-session-token",
    user: { id: "u-1", name: "Grace Okoro", email },
    tenant: {
      id: mockActiveTenantId,
      name: tenantName ?? mockMemberships.find((m) => m.tenantId === mockActiveTenantId)?.name ?? "The Perfume Stall",
    },
    tenants: mockMemberships,
  };
}

function seed() {
  if (seeded) return;
  seeded = true;

  const mk = (
    name: string,
    priceMinor: number,
    costMinor: number,
    stock: number,
    lowStockThreshold: number,
  ): MockProduct => {
    const product: MockProduct = {
      id: nid("p"),
      name,
      note: null,
      priceMinor,
      costMinor,
      lowStockThreshold,
      archived: false,
      createdAt: iso(),
      movements: [],
    };
    if (stock > 0) {
      product.movements.push({
        id: nid("m"),
        productId: product.id,
        type: "RESTOCK",
        quantity: stock,
        unitCostMinor: costMinor,
        note: "opening stock",
        createdAt: iso(),
      });
    }
    products.push(product);
    return product;
  };

  mk("Clean Nude 50ml", 15000, 9500, 24, 6);
  mk("Oud Lumiere 30ml", 22000, 13000, 8, 5);
  mk("Rose Royale 30ml", 12500, 7800, 40, 10);
  mk("Amber Nights 100ml", 18500, 11000, 0, 4);

  const patricia = { id: nid("c"), name: "Patricia Mensah", phone: "08023334444", archived: false, createdAt: iso() };
  const kofi = { id: nid("c"), name: "Kofi Boateng", phone: null, archived: false, createdAt: iso() };
  customers.push(patricia, kofi);

  const sale1 = {
    id: nid("t"),
    type: "SALE",
    customerId: patricia.id,
    productId: products[0].id,
    quantity: 2,
    unitPriceMinor: 15000,
    amountMinor: 30000,
    onCredit: true,
    note: null,
    createdAt: iso(),
  };
  const pay1 = {
    id: nid("t"),
    type: "PAYMENT",
    customerId: patricia.id,
    productId: null,
    quantity: 0,
    unitPriceMinor: null,
    amountMinor: 10000,
    onCredit: false,
    note: "cash",
    createdAt: iso(),
  };
  const sale2 = {
    id: nid("t"),
    type: "SALE",
    customerId: kofi.id,
    productId: products[0].id,
    quantity: 1,
    unitPriceMinor: 15000,
    amountMinor: 15000,
    onCredit: true,
    note: null,
    createdAt: iso(),
  };
  const sale3 = {
    id: nid("t"),
    type: "SALE",
    customerId: null,
    productId: products[2].id,
    quantity: 1,
    unitPriceMinor: 12500,
    amountMinor: 12500,
    onCredit: false,
    note: null,
    createdAt: iso(),
  };
  transactions.push(sale2, pay1, sale1, sale3);

  debtEntries.push(
    { id: nid("d"), customerId: patricia.id, type: "CREDIT", amountMinor: 30000, note: null, transactionId: sale1.id, createdAt: sale1.createdAt },
    { id: nid("d"), customerId: patricia.id, type: "PAYMENT", amountMinor: -10000, note: null, transactionId: pay1.id, createdAt: pay1.createdAt },
    { id: nid("d"), customerId: kofi.id, type: "CREDIT", amountMinor: 15000, note: null, transactionId: sale2.id, createdAt: sale2.createdAt },
  );
}

function stockQty(productId: string) {
  const product = products.find((p) => p.id === productId);
  return product ? product.movements.reduce((sum, m) => sum + m.quantity, 0) : 0;
}

function debtOf(customerId: string) {
  return debtEntries.filter((d) => d.customerId === customerId).reduce((sum, d) => sum + d.amountMinor, 0);
}

function publicProduct(p: MockProduct) {
  return {
    id: p.id,
    name: p.name,
    note: p.note,
    priceMinor: p.priceMinor,
    costMinor: p.costMinor,
    lowStockThreshold: p.lowStockThreshold,
    archived: p.archived,
    createdAt: p.createdAt,
    stockQty: stockQty(p.id),
  };
}

function publicCustomer(c: MockCustomer) {
  return { id: c.id, name: c.name, phone: c.phone, archived: c.archived, createdAt: c.createdAt, debtMinor: debtOf(c.id) };
}

const re = {
  productId: /^\/api\/products\/([^/]+)$/,
  productStock: /^\/api\/products\/([^/]+)\/stock$/,
  productMovements: /^\/api\/products\/([^/]+)\/movements$/,
  customerId: /^\/api\/customers\/([^/]+)$/,
  customerDebt: /^\/api\/customers\/([^/]+)\/debt$/,
};

function body<T>(options: MockOptions): T {
  return (options.body ?? {}) as T;
}

function bad(message: string): never {
  throw new ApiError(400, message);
}

export async function mockRequest<T>(path: string, options: MockOptions = {}): Promise<T> {
  seed();
  const method = options.method ?? "GET";
  const json = (value: unknown) => Promise.resolve(value as T);

  if (path === "/auth/login" && method === "POST") {
    const { email } = body<{ email?: string; password?: string }>(options);
    return json(mockSession(email ?? "demo@oloja.app"));
  }

  if (path === "/auth/register" && method === "POST") {
    const { tenantName, ownerName, email, password } = body<{
      tenantName?: string;
      ownerName?: string;
      email?: string;
      password?: string;
    }>(options);
    if (!tenantName || !ownerName) bad("Invalid input");
    if (!email || !email.includes("@")) bad("Invalid input");
    if (!password || password.length < 8) bad("Invalid input");
    if (registeredEmails.has(email.toLowerCase())) {
      throw new ApiError(409, "An account with this email already exists");
    }
    registeredEmails.add(email.toLowerCase());
    mockActiveTenantId = "t-1";
    return json(mockSession(email, tenantName));
  }

  if (path === "/auth/logout" && method === "POST") return json({ ok: true });

  if (path === "/auth/me" && method === "GET") {
    return json({
      user: { id: "u-1", name: "Grace Okoro", email: "demo@oloja.app" },
      tenant: mockMemberships.find((m) => m.tenantId === mockActiveTenantId) ?? mockMemberships[0],
      tenants: mockMemberships,
    });
  }

  if (path === "/auth/switch-shop" && method === "POST") {
    const { tenantId } = body<{ tenantId?: string }>(options);
    const membership = mockMemberships.find((m) => m.tenantId === tenantId);
    if (!membership) throw new ApiError(403, "You don't belong to that shop");
    mockActiveTenantId = membership.tenantId;
    return json(mockSession("demo@oloja.app"));
  }

  // ---- Phase 6: invites (owner-only management, any-member accept) ---------

  if (path === "/api/invites" && method === "GET") {
    if (currentRole() !== "OWNER") deny(["OWNER"]);
    return json({ invite: mockInvite, members: mockMembers });
  }

  if (path === "/api/invites" && method === "POST") {
    if (currentRole() !== "OWNER") deny(["OWNER"]);
    mockInvite = {
      code: mockInviteCode(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    return json(mockInvite);
  }

  const memberMatch = path.match(/^\/api\/invites\/members\/([^/]+)$/);
  if (memberMatch && (method === "PATCH" || method === "DELETE")) {
    if (currentRole() !== "OWNER") deny(["OWNER"]);
    const member = mockMembers.find((m) => m.id === memberMatch[1]);
    if (!member) throw new ApiError(404, "Member not found");
    if (member.role === "OWNER") {
      throw new ApiError(400, memberMatch[1] === "m-1" ? "The shop owner can't be removed" : "The shop owner's role can't be changed");
    }
    if (method === "DELETE") {
      mockMembers.splice(mockMembers.indexOf(member), 1);
      return json({ ok: true });
    }
    const { role } = body<{ role?: MembershipRole }>(options);
    member.role = role ?? "STAFF";
    return json({ ok: true, role: member.role });
  }

  if (path === "/api/invites/accept" && method === "POST") {
    const { code } = body<{ code?: string }>(options);
    if (!code) bad("Invalid input");
    const matches = mockInvite && code.toUpperCase() === mockInvite.code;
    if (!matches) throw new ApiError(404, "That invite code doesn't exist");
    if (mockMemberships.some((m) => m.tenantId === "t-3")) {
      throw new ApiError(410, "That invite code has already been used");
    }
    mockMemberships.push({ tenantId: "t-3", name: "Invite Demo", role: "STAFF" });
    const tenant = { id: "t-3", name: "Invite Demo" };
    return json({ tenant, role: "STAFF" });
  }

  if (path === "/api/products" && method === "GET") {
    return json({ products: products.map(publicProduct) });
  }

  if (path === "/api/products" && method === "POST") {
    if (currentRole() !== "OWNER") deny(["OWNER"]);
    const input = body<{
      name: string;
      priceMinor: number;
      costMinor: number;
      lowStockThreshold?: number;
      initialStockQty?: number;
    }>(options);
    if (!input.name?.trim()) bad("Invalid input");
    const stock = Math.max(Math.floor(input.initialStockQty ?? 0), 0);
    const product: MockProduct = {
      id: nid("p"),
      name: input.name.trim(),
      note: null,
      priceMinor: input.priceMinor,
      costMinor: input.costMinor,
      lowStockThreshold: input.lowStockThreshold ?? 0,
      archived: false,
      createdAt: iso(),
      movements: [],
    };
    if (stock > 0) {
      product.movements.push({
        id: nid("m"),
        productId: product.id,
        type: "RESTOCK",
        quantity: stock,
        unitCostMinor: input.costMinor,
        note: "Opening stock",
        createdAt: iso(),
      });
    }
    products.push(product);
    return json({ ...publicProduct(product) });
  }

  const productMatch = path.match(re.productId);
  if (productMatch && method === "GET") {
    const product = products.find((p) => p.id === productMatch[1]);
    if (!product) throw new ApiError(404, "Product not found");
    return json(publicProduct(product));
  }

  if (productMatch && method === "PATCH") {
    if (currentRole() !== "OWNER") deny(["OWNER"]);
    const product = products.find((p) => p.id === productMatch[1]);
    if (!product) throw new ApiError(404, "Product not found");
    const input = body<Record<string, unknown>>(options);
    if (typeof input.name === "string") product.name = input.name;
    if (typeof input.priceMinor === "number") product.priceMinor = input.priceMinor;
    if (typeof input.costMinor === "number") product.costMinor = input.costMinor;
    if (typeof input.lowStockThreshold === "number") product.lowStockThreshold = input.lowStockThreshold;
    if (typeof input.archived === "boolean") product.archived = input.archived;
    return json(publicProduct(product));
  }

  const stockMatch = path.match(re.productStock);
  if (stockMatch && method === "POST") {
    if (currentRole() === "VIEW") deny(["OWNER", "STAFF"]);
    const product = products.find((p) => p.id === stockMatch[1]);
    if (!product) throw new ApiError(404, "Product not found");
    const input = body<{ type: string; quantity: number; unitCostMinor?: number; note?: string }>(options);
    if (input.type === "RESTOCK") {
      if (input.quantity <= 0) bad("RESTOCK quantity must be positive");
      if (input.unitCostMinor === undefined) bad("unitCostMinor is required for a RESTOCK");
      product.costMinor = input.unitCostMinor;
    } else if (input.type === "ADJUST") {
      if (input.quantity === 0) bad("ADJUST quantity cannot be zero");
    } else {
      bad("Invalid input");
    }
    const movement: MockMovement = {
      id: nid("m"),
      productId: product.id,
      type: input.type,
      quantity: input.quantity,
      unitCostMinor: input.unitCostMinor ?? product.costMinor,
      note: input.note ?? null,
      createdAt: iso(),
    };
    product.movements.push(movement);
    return json({
      movement: {
        id: movement.id,
        type: movement.type,
        quantity: movement.quantity,
        unitCostMinor: movement.unitCostMinor,
        note: movement.note,
        createdAt: movement.createdAt,
      },
      stockQty: stockQty(product.id),
    });
  }

  const movementsMatch = path.match(re.productMovements);
  if (movementsMatch && method === "GET") {
    const product = products.find((p) => p.id === movementsMatch[1]);
    if (!product) throw new ApiError(404, "Product not found");
    const list = [...product.movements]
      .reverse()
      .slice(0, 50)
      .map((m) => ({
        id: m.id,
        type: m.type,
        quantity: m.quantity,
        unitCostMinor: m.unitCostMinor,
        note: m.note,
        createdAt: m.createdAt,
      }));
    return json({ movements: list });
  }

  if (path === "/api/customers" && method === "GET") {
    return json({ customers: customers.map(publicCustomer) });
  }

  if (path === "/api/customers" && method === "POST") {
    if (currentRole() === "VIEW") deny(["OWNER", "STAFF"]);
    const input = body<{ name: string; phone?: string }>(options);
    if (!input.name?.trim()) bad("Invalid input");
    const customer = {
      id: nid("c"),
      name: input.name.trim(),
      phone: input.phone ?? null,
      archived: false,
      createdAt: iso(),
    };
    customers.push(customer);
    return json({ ...publicCustomer(customer) });
  }

  const customerMatch = path.match(re.customerId);
  if (customerMatch && method === "GET") {
    const customer = customers.find((c) => c.id === customerMatch[1]);
    if (!customer) throw new ApiError(404, "Customer not found");
    return json(publicCustomer(customer));
  }

  if (customerMatch && method === "PATCH") {
    if (currentRole() === "VIEW") deny(["OWNER", "STAFF"]);
    const customer = customers.find((c) => c.id === customerMatch[1]);
    if (!customer) throw new ApiError(404, "Customer not found");
    const input = body<Record<string, unknown>>(options);
    if (typeof input.name === "string") customer.name = input.name;
    if (typeof input.phone === "string" || input.phone === null) customer.phone = input.phone as string | null;
    if (typeof input.archived === "boolean") customer.archived = input.archived;
    return json(publicCustomer(customer));
  }

  const debtMatch = path.match(re.customerDebt);
  if (debtMatch && method === "GET") {
    const customer = customers.find((c) => c.id === debtMatch[1]);
    if (!customer) throw new ApiError(404, "Customer not found");
    const entries = debtEntries
      .filter((d) => d.customerId === customer.id)
      .reverse()
      .slice(0, 50)
      .map((d) => ({
        id: d.id,
        type: d.type,
        amountMinor: d.amountMinor,
        note: d.note,
        transactionId: d.transactionId,
        createdAt: d.createdAt,
      }));
    return json({ entries, debtMinor: debtOf(customer.id) });
  }

  if (path === "/api/sales" && method === "POST") {
    if (currentRole() === "VIEW") deny(["OWNER", "STAFF"]);
    const input = body<{
      productId: string;
      quantity: number;
      customerId?: string;
      unitPriceMinor?: number;
      onCredit?: boolean;
      note?: string;
    }>(options);
    const product = products.find((p) => p.id === input.productId);
    if (!product) throw new ApiError(404, "Product not found");
    if (input.customerId) {
      const customer = customers.find((c) => c.id === input.customerId);
      if (!customer) throw new ApiError(404, "Customer not found");
    }
    const onCredit = input.onCredit ?? false;
    if (onCredit && !input.customerId) bad("An on-credit sale needs a customerId");
    const available = stockQty(product.id);
    if (available < input.quantity) bad(`Not enough stock (${available} available)`);
    const unitPriceMinor = input.unitPriceMinor ?? product.priceMinor;
    const amountMinor = input.quantity * unitPriceMinor;
    const transaction: MockTransaction = {
      id: nid("t"),
      type: "SALE",
      customerId: input.customerId ?? null,
      productId: product.id,
      quantity: input.quantity,
      unitPriceMinor,
      amountMinor,
      onCredit,
      note: input.note ?? null,
      createdAt: iso(),
    };
    transactions.unshift(transaction);
    product.movements.push({
      id: nid("m"),
      productId: product.id,
      type: "SALE",
      quantity: -input.quantity,
      unitCostMinor: product.costMinor,
      note: "sale",
      createdAt: transaction.createdAt,
    });
    if (onCredit && input.customerId) {
      debtEntries.push({
        id: nid("d"),
        customerId: input.customerId,
        type: "CREDIT",
        amountMinor,
        note: null,
        transactionId: transaction.id,
        createdAt: transaction.createdAt,
      });
    }
    return json({
      transaction: {
        id: transaction.id,
        type: transaction.type,
        customerId: transaction.customerId,
        productId: transaction.productId,
        quantity: transaction.quantity,
        unitPriceMinor: transaction.unitPriceMinor,
        amountMinor: transaction.amountMinor,
        onCredit: transaction.onCredit,
        note: transaction.note,
        createdAt: transaction.createdAt,
      },
      stockQty: stockQty(product.id),
    });
  }

  if (path === "/api/payments" && method === "POST") {
    if (currentRole() === "VIEW") deny(["OWNER", "STAFF"]);
    const input = body<{ customerId: string; amountMinor: number; note?: string }>(options);
    const customer = customers.find((c) => c.id === input.customerId);
    if (!customer) throw new ApiError(404, "Customer not found");
    if (debtOf(customer.id) <= 0) bad("This customer has no outstanding debt to pay");
    const transaction: MockTransaction = {
      id: nid("t"),
      type: "PAYMENT",
      customerId: customer.id,
      productId: null,
      quantity: 0,
      unitPriceMinor: null,
      amountMinor: input.amountMinor,
      onCredit: false,
      note: input.note ?? null,
      createdAt: iso(),
    };
    transactions.unshift(transaction);
    debtEntries.push({
      id: nid("d"),
      customerId: customer.id,
      type: "PAYMENT",
      amountMinor: -input.amountMinor,
      note: null,
      transactionId: transaction.id,
      createdAt: transaction.createdAt,
    });
    return json({
      transaction: {
        id: transaction.id,
        type: transaction.type,
        customerId: transaction.customerId,
        productId: transaction.productId,
        quantity: transaction.quantity,
        unitPriceMinor: transaction.unitPriceMinor,
        amountMinor: transaction.amountMinor,
        onCredit: transaction.onCredit,
        note: transaction.note,
        createdAt: transaction.createdAt,
      },
      debtMinor: Math.max(debtOf(customer.id), 0),
    });
  }

  if (path === "/api/transactions" && method === "GET") {
    return json({
      transactions: transactions.slice(0, 100).map((t) => ({
        id: t.id,
        type: t.type,
        customerId: t.customerId,
        productId: t.productId,
        quantity: t.quantity,
        unitPriceMinor: t.unitPriceMinor,
        amountMinor: t.amountMinor,
        onCredit: t.onCredit,
        note: t.note,
        createdAt: t.createdAt,
        product: products.find((p) => p.id === t.productId) ? { name: products.find((p) => p.id === t.productId)?.name } : null,
        customer: customers.find((c) => c.id === t.customerId) ? { name: customers.find((c) => c.id === t.customerId)?.name } : null,
      })),
    });
  }

  throw new ApiError(404, `Mock API has no handler for ${method} ${path}`);
}