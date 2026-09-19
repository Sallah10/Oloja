import { Prisma } from "@prisma/client";
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

    const { tenant, user, token } = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({ data: { name: input.tenantName } });
      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: input.ownerName,
          email,
          passwordHash: await hashPassword(input.password),
        },
      });
      const token = await createSession(tx, user.id, tenant.id);
      return { tenant, user, token };
    });

    res.status(201).json({
      token,
      user: publicUser(user),
      tenant: { id: tenant.id, name: tenant.name },
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
      select: { id: true, name: true, email: true, passwordHash: true, tenantId: true },
    });

    // Same error for missing user and wrong password: never reveal which one.
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new HttpError(401, "Email or password is incorrect");
    }

    const token = await createSession(db, user.id, user.tenantId);
    const tenant = await db.tenant.findUniqueOrThrow({
      where: { id: user.tenantId },
      select: { id: true, name: true },
    });

    res.json({
      token,
      user: publicUser(user),
      tenant: { id: tenant.id, name: tenant.name },
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
    const [user, tenant] = await Promise.all([
      db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      }),
      db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { id: true, name: true } }),
    ]);
    res.json({ user, tenant });
  }),
);