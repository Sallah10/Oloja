import { MembershipRole } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { HttpError, asyncHandler } from "../lib/http-error.js";
import { runIdempotent } from "../lib/idempotency.js";
import { notifyShop } from "../lib/notify.js";
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
  barcode: true,
  priceMinor: true,
  costMinor: true,
  lowStockThreshold: true,
  archived: true,
  createdAt: true,
  // Cheap proxy for "has a photo": the mime is only ever set together with the
  // bytes, so this says yes without dragging every photo into a list query.
  imageMime: true,
  updatedAt: true,
} as const;

type ProductRow = Record<string, unknown> & { imageMime?: string | null; updatedAt: Date | string };

/** Every product read goes through here so `hasImage` is always present. */
/**
 * `hasImage` says whether a photo exists without the bytes, and `imageVersion`
 * is the clock it was written at. The phone puts the version in the image URL,
 * so replacing a photo is a new URL - expo-image would otherwise serve the old
 * one out of its cache until the day is over.
 */
function withPhoto<T extends ProductRow>(product: T): Omit<T, "imageMime"> & {
  hasImage: boolean;
  imageVersion: string | null;
} {
  const { imageMime, ...rest } = product;
  const hasImage = imageMime !== null && imageMime !== undefined;
  const stamp = rest.updatedAt;
  const clock = stamp instanceof Date ? stamp : new Date(String(stamp));
  return {
    ...rest,
    hasImage,
    imageVersion: hasImage && !Number.isNaN(clock.getTime()) ? clock.toISOString() : null,
  };
}

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
  barcode: z.string().trim().max(32).optional(),
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
  barcode: z.string().trim().max(32).nullable().optional(),
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

// Barcodes are unique per shop so a scan always lands on one product. The
// check is a QoL guard; the (tenantId, barcode) unique constraint catches any
// race underneath and surfaces as a 500 if two POSTs slip through.
async function assertBarcodeAvailable(
  scoped: { product: TenantScopedClient["product"] },
  tenantId: string,
  barcode: string | null | undefined,
  excludeId?: string,
) {
  if (!barcode) return;
  const existing = await scoped.product.findFirst({
    where: { tenantId, barcode, NOT: excludeId ? { id: excludeId } : undefined },
    select: { id: true },
  });
  if (existing) throw new HttpError(400, "A product with that barcode already exists");
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
      products: products.map((p) => ({ ...withPhoto(p), stockQty: qty.get(p.id) ?? 0 })),
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

    res.json({ ...withPhoto(product), stockQty: await stockQty(scoped, id) });
  }),
);

// --- photos -----------------------------------------------------------------
//
// Stored as BYTEA on the product row (Render's disk is ephemeral). The app
// downscales to ~800px JPEG before upload, so these routes only ever see small
// JPEGs; anything else is refused rather than stored.

const MAX_IMAGE_BYTES = 1_500_000;
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

const imageSchema = z.object({
  /** base64 JPEG, no data: prefix. */
  data: z.string().min(64).max(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024),
  width: z.number().int().positive().max(4000).optional(),
  height: z.number().int().positive().max(4000).optional(),
});

/**
 * A photo is part of the product record, so only the owner changes it - same
 * rule as editing the price or the name. Cashiers and viewers may look.
 */
productsRouter.put(
  "/products/:id/image",
  requireRole(MembershipRole.OWNER),
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const { id } = idParam.parse(req.params);
    const input = imageSchema.parse(req.body);

    const exists = await scoped.product.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw new HttpError(404, "Product not found");

    const bytes = Buffer.from(input.data, "base64");
    if (bytes.length === 0) throw new HttpError(400, "That photo was empty");
    if (bytes.length > MAX_IMAGE_BYTES) {
      throw new HttpError(400, "That photo is too large - pick a smaller one");
    }
    // The client sends JPEG only; refuse anything else rather than storing a
    // format the app cannot render.
    if (!bytes.subarray(0, 3).equals(JPEG_MAGIC)) {
      throw new HttpError(400, "Only JPEG photos are supported");
    }

    await scoped.product.updateMany({
      where: { id },
      data: {
        imageBytes: bytes,
        imageMime: "image/jpeg",
        imageWidth: input.width ?? null,
        imageHeight: input.height ?? null,
      },
    });

    res.json({ ok: true, bytes: bytes.length });
  }),
);

productsRouter.delete(
  "/products/:id/image",
  requireRole(MembershipRole.OWNER),
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const { id } = idParam.parse(req.params);

    const { count } = await scoped.product.updateMany({
      where: { id },
      data: { imageBytes: null, imageMime: null, imageWidth: null, imageHeight: null },
    });
    if (count === 0) throw new HttpError(404, "Product not found");

    res.json({ ok: true });
  }),
);

/**
 * Served through the normal auth middleware, so expo-image needs the bearer
 * token (see ProductThumb in the app). ETag on updatedAt lets the phone keep
 * showing its cached copy until the photo actually changes.
 */
productsRouter.get(
  "/products/:id/image",
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const { id } = idParam.parse(req.params);

    const product = await scoped.product.findFirst({
      where: { id },
      select: { imageBytes: true, imageMime: true, updatedAt: true },
    });
    if (!product?.imageBytes) throw new HttpError(404, "This product has no photo");

    const etag = `W/"p-${product.updatedAt.getTime()}"`;
    if (req.headers["if-none-match"] === etag) {
      res.status(304).end();
      return;
    }

    res.setHeader("Content-Type", product.imageMime ?? "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("ETag", etag);
    // end(), not send(): send() would tag the type with a charset, which has no
    // meaning on a JPEG.
    res.end(product.imageBytes);
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
        await assertBarcodeAvailable(tx, auth.tenantId, input.barcode);
        const created = await tx.product.create({
          // tenantId is explicit for the types; the scoped hook overwrites it
          // regardless, so a caller could never spoof another tenant.
          data: {
            tenantId: auth.tenantId,
            name: input.name,
            note: input.note,
            barcode: input.barcode && input.barcode.length > 0 ? input.barcode : null,
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

        return { ...withPhoto(created), stockQty: openingQty };
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
    const auth = (req as AuthedRequest).auth;
    const { id } = idParam.parse(req.params);
    const input = updateSchema.parse(req.body);
    if (Object.keys(input).length === 0) throw new HttpError(400, "Nothing to update");

    const exists = await scoped.product.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw new HttpError(404, "Product not found");

    let data = { ...input };
    if (data.barcode === "") data.barcode = null;
    if (data.barcode !== undefined) {
      await assertBarcodeAvailable(scoped, auth.tenantId, data.barcode, id);
    }

    await scoped.product.updateMany({ where: { id }, data });
    const product = await scoped.product.findFirst({ where: { id }, select: productFields });
    res.json({ ...withPhoto(product!), stockQty: await stockQty(scoped, id) });
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
          select: { id: true, costMinor: true, name: true, lowStockThreshold: true },
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

        return {
          movement,
          stockQty: await stockQty(tx, id),
          productName: product.name,
          threshold: product.lowStockThreshold,
        };
      },
    );

    // Crossing INTO low stock is the moment worth a phone alert; staying low
    // after every restock would be noise.
    const before = result.stockQty - input.quantity;
    const crossedLow =
      result.threshold > 0 && before > result.threshold && result.stockQty <= result.threshold;
    if (crossedLow) {
      void notifyShop(auth.tenantId, {
        title: result.stockQty === 0 ? `${result.productName} is out of stock` : `Low: ${result.productName}`,
        body:
          result.stockQty === 0
            ? "Nothing left on the shelf. Add more before the next customer asks."
            : `${result.stockQty} left - your alert is ${result.threshold}.`,
        data: { screen: "product", productId: id },
      });
    }

    res.status(201).json({ movement: result.movement, stockQty: result.stockQty });
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