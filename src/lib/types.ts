export type ProductSummary = {
  id: string;
  name: string;
  note: string | null;
  priceMinor: number;
  costMinor: number;
  lowStockThreshold: number;
  archived: boolean;
  createdAt: string;
  stockQty: number;
};

export type CustomerSummary = {
  id: string;
  name: string;
  phone: string | null;
  archived: boolean;
  createdAt: string;
  debtMinor: number;
};

export type TransactionSummary = {
  id: string;
  type: "SALE" | "PAYMENT";
  customerId: string | null;
  productId: string | null;
  quantity: number;
  unitPriceMinor: number | null;
  amountMinor: number;
  onCredit: boolean;
  note: string | null;
  createdAt: string;
  product: { name: string } | null;
  customer: { name: string } | null;
};

export type DebtEntry = {
  id: string;
  type: "CREDIT" | "PAYMENT" | "ADJUST";
  amountMinor: number;
  note: string | null;
  transactionId: string | null;
  createdAt: string;
};

export type StockMovement = {
  id: string;
  type: "RESTOCK" | "ADJUST" | "SALE";
  quantity: number;
  unitCostMinor: number;
  note: string | null;
  createdAt: string;
};

// Phase 6: multi-shop onboarding. A person belongs to any number of shops,
// each with its own role. OWNER runs the shop; STAFF sells, takes payments,
// gives credit and moves stock; VIEW can read but not touch.
export type MembershipRole = "OWNER" | "STAFF" | "VIEW";

export type TenantMembership = {
  tenantId: string;
  name: string;
  role: MembershipRole;
};

export type InviteInfo = {
  code: string;
  expiresAt: string;
};

export type ShopMember = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MembershipRole;
  joinedAt: string;
};