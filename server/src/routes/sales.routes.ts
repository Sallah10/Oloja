import { Router } from "express";
import { z } from "zod";

import { debtBalance } from "../lib/debt.js";
import { HttpError, asyncHandler } from "../lib/http-error.js";
import { tenantScoped } from "../lib/scoped.js";
import { AuthedRequest, requireAuth } from "../middleware/auth.js";

export const salesRouter = Router();

salesRouter.use(requireAuth);

function scopedFor(req: AuthedRequest) {
  return tenantScoped(req.auth.tenantId);
}

// One Transaction row == one product line sold, or one payment received.
// A SALE also writes an append-only StockMovement (stock out) and, when taken
// on credit, a CREDIT debt entry. A PAYMENT writes only a PAYMENT debt entry.

const saleFields = {
  id: true,
  type: true,
  customerId: true,
  productId: true,
  quantity: true,
  unitPriceMinor: true,
  amountMinor: true,
  onCredit: true,
  note: true,
  createdAt: true,
} as const;

const saleSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  customerId: z.string().min(1).optional(),
  unitPriceMinor: z.number().int().positive().optional(),
  onCredit: z.boolean().default(false),
  note: z.string().trim().max(240).optional(),
});

const paymentSchema = z.object({
  customerId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  note: z.string().trim().max(240).optional(),
});

async function stockQty(scoped: ReturnType<typeof tenantScoped>, productId: string) {
  const agg = await scoped.stockMovement.aggregate({
    where: { productId },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

salesRouter.post(
  "/sales",
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const auth = (req as AuthedRequest).auth;
    const input = saleSchema.parse(req.body);

    const product = await scoped.product.findFirst({
      where: { id: input.productId },
      select: { id: true, priceMinor: true, costMinor: true },
    });
    if (!product) throw new HttpError(404, "Product not found");

    if (input.customerId) {
      const customer = await scoped.customer.findFirst({
        where: { id: input.customerId },
        select: { id: true },
      });
      if (!customer) throw new HttpError(404, "Customer not found");
    }
    if (input.onCredit && !input.customerId) {
      throw new HttpError(400, "An on-credit sale needs a customerId");
    }

    const available = await stockQty(scoped, input.productId);
    if (available < input.quantity) {
      throw new HttpError(400, `Not enough stock (${available} available)`);
    }

    const unitPriceMinor = input.unitPriceMinor ?? product.priceMinor;
    const amountMinor = input.quantity * unitPriceMinor;

    // Atomic: a sale is one transaction row + one stock movement + (on credit)
    // one debt entry. The scoped hooks fire inside $transaction (proven by
    // scope:check), so every row is still tenant-stamped.
    const sale = await scoped.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          tenantId: auth.tenantId,
          type: "SALE",
          productId: input.productId,
          customerId: input.customerId ?? null,
          quantity: input.quantity,
          unitPriceMinor,
          amountMinor,
          onCredit: input.onCredit,
          note: input.note,
        },
        select: saleFields,
      });
      await tx.stockMovement.create({
        data: {
          tenantId: auth.tenantId,
          productId: input.productId,
          type: "SALE",
          quantity: -input.quantity,
          unitCostMinor: product.costMinor,
          note: "sale",
        },
      });
      if (input.onCredit) {
        await tx.debtEntry.create({
          data: {
            tenantId: auth.tenantId,
            customerId: input.customerId!,
            type: "CREDIT",
            amountMinor,
            transactionId: transaction.id,
          },
        });
      }
      return transaction;
    });

    res.status(201).json({ transaction: sale, stockQty: available - input.quantity });
  }),
);

salesRouter.post(
  "/payments",
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const auth = (req as AuthedRequest).auth;
    const input = paymentSchema.parse(req.body);

    const customer = await scoped.customer.findFirst({
      where: { id: input.customerId },
      select: { id: true },
    });
    if (!customer) throw new HttpError(404, "Customer not found");

    const debtBefore = await debtBalance(scoped, input.customerId);
    if (debtBefore <= 0) {
      throw new HttpError(400, "This customer has no outstanding debt to pay");
    }

    const payment = await scoped.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          tenantId: auth.tenantId,
          type: "PAYMENT",
          customerId: input.customerId,
          quantity: 0,
          unitPriceMinor: null,
          amountMinor: input.amountMinor,
          onCredit: false,
          note: input.note,
        },
        select: saleFields,
      });
      await tx.debtEntry.create({
        data: {
          tenantId: auth.tenantId,
          customerId: input.customerId,
          type: "PAYMENT",
          amountMinor: -input.amountMinor,
          transactionId: transaction.id,
        },
      });
      return transaction;
    });

    res.status(201).json({
      transaction: payment,
      debtMinor: Math.max(debtBefore - input.amountMinor, 0),
    });
  }),
);

salesRouter.get(
  "/transactions",
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);

    const transactions = await scoped.transaction.findMany({
      select: {
        ...saleFields,
        product: { select: { name: true } },
        customer: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json({ transactions });
  }),
);