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