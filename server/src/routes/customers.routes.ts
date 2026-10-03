import { Router } from "express";
import { z } from "zod";

import { debtBalance } from "../lib/debt.js";
import { HttpError, asyncHandler } from "../lib/http-error.js";
import { runIdempotent } from "../lib/idempotency.js";
import { tenantScoped } from "../lib/scoped.js";
import { AuthedRequest, NOT_VIEW, requireAuth, requireRole } from "../middleware/auth.js";

export const customersRouter = Router();

customersRouter.use(requireAuth);

function scopedFor(req: AuthedRequest) {
  return tenantScoped(req.auth.tenantId);
}

const customerFields = {
  id: true,
  name: true,
  phone: true,
  archived: true,
  createdAt: true,
} as const;

const debtEntryFields = {
  id: true,
  type: true,
  amountMinor: true,
  note: true,
  transactionId: true,
  createdAt: true,
} as const;

const idParam = z.object({ id: z.string().min(1) });

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(24).optional(),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(24).nullable().optional(),
  archived: z.boolean().optional(),
});

customersRouter.get(
  "/customers",
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const includeArchived = req.query.archived === "all";

    const [customers, byCustomer] = await Promise.all([
      scoped.customer.findMany({
        where: includeArchived ? {} : { archived: false },
        select: customerFields,
        orderBy: { createdAt: "desc" },
      }),
      scoped.debtEntry.groupBy({
        by: ["customerId"],
        _sum: { amountMinor: true },
      }),
    ]);

    const debt = new Map(byCustomer.map((r) => [r.customerId, r._sum.amountMinor ?? 0]));
    res.json({
      customers: customers.map((c) => ({ ...c, debtMinor: debt.get(c.id) ?? 0 })),
    });
  }),
);

customersRouter.get(
  "/customers/:id",
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const { id } = idParam.parse(req.params);

    const customer = await scoped.customer.findFirst({ where: { id }, select: customerFields });
    if (!customer) throw new HttpError(404, "Customer not found");

    res.json({ ...customer, debtMinor: await debtBalance(scoped, id) });
  }),
);

customersRouter.post(
  "/customers",
  requireRole(...NOT_VIEW),
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const auth = (req as AuthedRequest).auth;
    const { idempotencyKey, ...input } = createSchema.parse(req.body);

    const customer = await runIdempotent(
      scoped,
      auth.tenantId,
      idempotencyKey,
      "POST",
      "/api/customers",
      async (tx) => {
        const created = await tx.customer.create({
          // tenantId explicit for the types; the scoped hook overwrites regardless.
          data: { tenantId: auth.tenantId, ...input },
          select: customerFields,
        });
        return { ...created, debtMinor: 0 };
      },
    );
    res.status(201).json(customer);
  }),
);

customersRouter.patch(
  "/customers/:id",
  requireRole(...NOT_VIEW),
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const { id } = idParam.parse(req.params);
    const input = updateSchema.parse(req.body);
    if (Object.keys(input).length === 0) throw new HttpError(400, "Nothing to update");

    const exists = await scoped.customer.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw new HttpError(404, "Customer not found");

    await scoped.customer.updateMany({ where: { id }, data: input });
    const customer = await scoped.customer.findFirst({ where: { id }, select: customerFields });
    res.json({ ...customer, debtMinor: await debtBalance(scoped, id) });
  }),
);

// The customer's side of the append-only debt ledger.
customersRouter.get(
  "/customers/:id/debt",
  asyncHandler(async (req, res) => {
    const scoped = scopedFor(req as AuthedRequest);
    const { id } = idParam.parse(req.params);

    const exists = await scoped.customer.findFirst({ where: { id }, select: { id: true } });
    if (!exists) throw new HttpError(404, "Customer not found");

    const entries = await scoped.debtEntry.findMany({
      where: { customerId: id },
      select: debtEntryFields,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json({ entries, debtMinor: await debtBalance(scoped, id) });
  }),
);