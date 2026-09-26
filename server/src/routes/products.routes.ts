import { MembershipRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { HttpError, asyncHandler } from "../lib/http-error.js";
import { runIdempotent } from "../lib/idempotency.js";
import { TenantScopedClient, tenantScoped } from "../lib/scoped.js";
import { AuthedRequest, NOT_VIEW, requireAuth, requireRole } from "../middleware/auth.js";

export const productsRouter = Router();

productsRouter.use(requireAuth);

function scopedFor(req: AuthedRequest) {
  return tenantScoped(req.auth.tenantId);
}

// NOTE (rule #2): stock_movements is APPEND-ONLY. There is no update/delete
// endpoint for movements on purpose - a wrong entry is fixed with a new
// ADJUST entry, never edited in place. Stock on hand == SUM(stockMoveQty).

const productFields = {
  id: true,
  name: true,
  note: true,
  priceMinor: true,
  costMinor: true,
  lowStockThreshold: true,
  archived: true,
  createdAt: true,
} as const;

const movementFields = {
  id: true,
  type: true,
  quantity: true,
  unitCostMinor: true,
  note: true,
  createdAt: true,
} as const;

const idParam = z.object({ id: z.string().min(1) });

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  note: z.string().trim().max(240).optional(),
  priceMinor: z.number().int().positive(),
  costMinor: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative().default(0),
  // Units already on hand at creation. Written as a RESTOCK movement so the
  // ledger stays append-only and stock on hand is still SUM(quantity).
  initialStockQty: z.number().int().nonnegative().default(0),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  note: z.string().trim().max(240).nullable().optional(),
  priceMinor: z.number().int().positive().optional(),
  costMinor: z.number().int().nonnegative().optional(),
  lowStockThreshold: z.number().int().nonnegative().optional(),
  archived: z.boolean().optional(),
});

const stockSchema = z.object({
  type: z.enum(["RESTOCK", "ADJUST"]),
  quantity: z.number().int(),
  unitCostMinor: z.number().int().nonnegative().optional(),
  note: z.string().trim().max(240).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

async function stockQty(scoped: { stockMovement: TenantScopedClient["stockMovement"] }, productId: string) {
  const agg = await scoped.stockMovement.aggregate({
    where: { productId },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

productsRouter.get(
  "/products",
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const includeArchived = req.query.archived === "all";

    const [products, byProduct] = await Promise.all([
      scoped.product.findMany({
        where: includeArchived ? {} : { archived: false },
        select: productFields,
        orderBy: { createdAt: "desc" },
      }),
      scoped.stockMovement.groupBy({
        by: ["productId"],
        _sum: { quantity: true },
      }),
    ]);

    const qty = new Map(byProduct.map((r) => [r.productId, r._sum.quantity ?? 0]));
    res.json({
      products: products.map((p) => ({ ...p, stockQty: qty.get(p.id) ?? 0 })),
    });
  }),
);

productsRouter.get(
  "/products/:id",
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const { id } = idParam.parse(req.params);

    const product = await scoped.product.findFirst({ where: { id }, select: productFields });
    if (!product) throw new HttpError(404, "Product not found");

    res.json({ ...product, stockQty: await stockQty(scoped, id) });
  }),
);

productsRouter.post(
  "/products",
  requireRole(MembershipRole.OWNER),
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const auth = (req as AuthedRequest).auth;
    const { idempotencyKey, ...input } = createSchema.parse(req.body);

    const product = await runIdempotent(
      scoped,
      auth.tenantId,
      idempotencyKey,
      "POST",
      "/api/products",
      async (tx) => {
        const created = await tx.product.create({
          // tenantId is explicit for the types; the scoped hook overwrites it
          // regardless, so a caller could never spoof another tenant.
          data: {
            tenantId: auth.tenantId,
            name: input.name,
            note: input.note,
            priceMinor: input.priceMinor,
            costMinor: input.costMinor,
            lowStockThreshold: input.lowStockThreshold,
          },
          select: productFields,
        });

        // Opening stock is an append-only RESTOCK event, identical to a
        // later restock. The cost caches on the product itself, so splitting
        // stock out of create later keeps the ledger correct.
        let openingQty = 0;
        if (input.initialStockQty > 0) {
          await tx.stockMovement.create({
            data: {
              tenantId: auth.tenantId,
              productId: created.id,
              type: "RESTOCK",
              quantity: input.initialStockQty,
              unitCostMinor: input.costMinor,
              note: "Opening stock",
            },
            select: movementFields,
          });
          openingQty = input.initialStockQty;
        }

        return { ...created, stockQty: openingQty };
      },
    );
    res.status(201).json(product);
  }),
);

productsRouter.patch(
  "/products/:id",
  requireRole(MembershipRole.OWNER),
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const { id } = idParam.parse(req.params);
    const input = updateSchema.parse(req.body);
    if (Object.keys(input).length === 0) throw new HttpError(400, "Nothing to update");

    const exists = await scoped.product.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw new HttpError(404, "Product not found");

    await scoped.product.updateMany({ where: { id }, data: input });
    const product = await scoped.product.findFirst({ where: { id }, select: productFields });
    res.json({ ...product, stockQty: await stockQty(scoped, id) });
  }),
);

productsRouter.post(
  "/products/:id/stock",
  requireRole(...NOT_VIEW),
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const auth = (req as AuthedRequest).auth;
    const { id } = idParam.parse(req.params);
    const { idempotencyKey, ...input } = stockSchema.parse(req.body);

    const result = await runIdempotent(
      scoped,
      auth.tenantId,
      idempotencyKey,
      "POST",
      `/api/products/${id}/stock`,
      async (tx) => {
        const product = await tx.product.findFirst({
          where: { id },
          select: { id: true, costMinor: true },
        });
        if (!product) throw new HttpError(404, "Product not found");

        if (input.type === "RESTOCK" && input.quantity <= 0) {
          throw new HttpError(400, "RESTOCK quantity must be positive");
        }
        if (input.type === "ADJUST" && input.quantity === 0) {
          throw new HttpError(400, "ADJUST quantity cannot be zero");
        }
        if (input.type === "RESTOCK" && input.unitCostMinor === undefined) {
          throw new HttpError(400, "unitCostMinor is required for a RESTOCK");
        }

        // Movement is written FIRST: it is the source of truth and appends
        // cleanly. The cost update on the product is a convenience cache that
        // heals on the next restock, so a crash between the two leaves the
        // ledger correct.
        const unitCostMinor =
          input.type === "RESTOCK"
            ? input.unitCostMinor!
            : (input.unitCostMinor ?? product.costMinor);

        const movement = await tx.stockMovement.create({
          data: {
            tenantId: auth.tenantId,
            productId: id,
            type: input.type,
            quantity: input.quantity,
            unitCostMinor,
            note: input.note,
          },
          select: movementFields,
        });

        if (input.type === "RESTOCK") {
          await tx.product.updateMany({ where: { id }, data: { costMinor: unitCostMinor } });
        }

        return { movement, stockQty: await stockQty(tx, id) };
      },
    );

    res.status(201).json(result);
  }),
);

productsRouter.get(
  "/products/:id/movements",
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const { id } = idParam.parse(req.params);

    const exists = await scoped.product.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw new HttpError(404, "Product not found");

    const movements = await scoped.stockMovement.findMany({
      where: { productId: id },
      select: movementFields,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ movements });
  }),
);