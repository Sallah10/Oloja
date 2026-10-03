import { MembershipRole, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";

import { HttpError, asyncHandler } from "../lib/http-error.js";
import { db } from "../lib/db.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { SESSION_TTL_MS, generateToken, hashToken } from "../lib/tokens.js";
import { AuthedRequest, requireAuth } from "../middleware/auth.js";

type Tx = Prisma.TransactionClient;

export const authRouter = Router();

const emailSchema = z.string().trim().email().max(254);

const registerSchema = z.object({
  tenantName: z.string().trim().min(1).max(80),
  ownerName: z.string().trim().min(1).max(80),
  email: emailSchema,
  password: z.string().min(8).max(72),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(72),
});

const switchSchema = z.object({
  tenantId: z.string().min(1).max(64),
});

function publicUser(user: { id: string; name: string; email: string }) {
  return { id: user.id, name: user.name, email: user.email };
}

async function createSession(tx: Tx, userId: string, tenantId: string) {
  const token = generateToken();
  await tx.session.create({
    data: {
      userId,
      tenantId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  return token;
}

type MembershipRow = {
  role: MembershipRole;
  tenant: { id: string; name: string };
};

// Phase 6: a login is an ACCOUNT, not a shop. Every tenant the user belongs to
// is listed; the "active" one is what the token is scoped to. Owners default
// to their own shop, everyone else to their first membership.
function pickActive(memberships: MembershipRow[]): MembershipRow | undefined {
  return memberships.find((m) => m.role === MembershipRole.OWNER) ?? memberships[0];
}

async function membershipsFor<T extends Pick<Tx, "tenant"> | typeof db = typeof db>(
  client: Tx | typeof db,
  userId: string,
): Promise<MembershipRow[]> {
  return client.userTenant.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { role: true, tenant: { select: { id: true, name: true } } },
  });
}

// NOTE (rule #2): the lookups in this file are intentionally NOT tenant-scoped.
// You cannot know a tenantId before the user authenticates. This is the one
// deliberate exception, and it is never copied into business routes.

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const email = input.email.toLowerCase();

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      throw new HttpError(409, "An account with this email already exists");
    }

    const { user, token, tenant } = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: input.tenantName } });
      const user = await tx.user.create({
        data: {
          name: input.ownerName,
          email,
          passwordHash: await hashPassword(input.password),
        },
      });
      await tx.userTenant.create({
        data: { userId: user.id, tenantId: tenant.id, role: MembershipRole.OWNER },
      });
      const token = await createSession(tx, user.id, tenant.id);
      return { user, token, tenant };
    });

    const tenants = [{ tenantId: tenant.id, name: tenant.name, role: MembershipRole.OWNER }];
    res.status(201).json({
      token,
      user: publicUser(user),
      tenant: { id: tenant.id, name: tenant.name },
      tenants,
    });
  }),
);

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const email = input.email.toLowerCase();

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, name: true, email: true, passwordHash: true },
    });

    // Same error for missing user and wrong password: never reveal which one.
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new HttpError(401, "Email or password is incorrect");
    }

    const memberships = await membershipsFor(db, user.id);
    const active = pickActive(memberships);
    if (!active) {
      throw new HttpError(401, "Email or password is incorrect");
    }

    const token = await createSession(db, user.id, active.tenant.id);
    res.json({
      token,
      user: publicUser(user),
      tenant: { id: active.tenant.id, name: active.tenant.name },
      tenants: memberships.map((m) => ({
        tenantId: m.tenant.id,
        name: m.tenant.name,
        role: m.role,
      })),
    });
  }),
);

// Phase 6: open a different shop for the SAME account. The user must already
// belong to it (verified) - this is a session re-scope, not an invite flow.
authRouter.post(
  "/switch-shop",
  requireAuth,
  asyncHandler(async (req, res) => {
    const input = switchSchema.parse(req.body);
    const { userId } = (req as AuthedRequest).auth;

    const membership = await db.userTenant.findUnique({
      where: { userId_tenantId: { userId, tenantId: input.tenantId } },
      include: { tenant: { select: { id: true, name: true } } },
    });
    if (!membership) {
      throw new HttpError(403, "You don't belong to that shop");
    }

    const memberships = await membershipsFor(db, userId);
    const token = await createSession(db, userId, membership.tenantId);

    res.json({
      token,
      user: await db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      }),
      tenant: { id: membership.tenant.id, name: membership.tenant.name },
      tenants: memberships.map((m) => ({
        tenantId: m.tenant.id,
        name: m.tenant.name,
        role: m.role,
      })),
    });
  }),
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { sessionId } = (req as AuthedRequest).auth;
    await db.session.delete({ where: { id: sessionId } });
    res.json({ ok: true });
  }),
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId, tenantId } = (req as AuthedRequest).auth;
    const [user, memberships, activeTenant] = await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      }),
      membershipsFor(db, userId),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true } }),
    ]);
    res.json({
      user,
      tenant: activeTenant,
      tenants: memberships.map((m) => ({
        tenantId: m.tenant.id,
        name: m.tenant.name,
        role: m.role,
      })),
    });
  }),
);