import { MembershipRole } from "@prisma/client";
import { NextFunction, Request, Response } from "express";

import { db } from "../lib/db.js";
import { hashToken } from "../lib/tokens.js";

export type AuthContext = {
  userId: string;
  tenantId: string;
  sessionId: string;
  role: MembershipRole;
};

export type AuthedRequest = Request & { auth: AuthContext };

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : undefined;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, tenantId: true, userId: true, expiresAt: true },
  });

  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (session.expiresAt < new Date()) {
    // Stale session: clean it up instead of leaving it to rot.
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Phase 6: a session is only alive while its user STILL belongs to the shop
  // it was minted for. If the membership was removed by an owner meanwhile,
  // the token dies with it (checked on every request, so revocation is instant).
  const membership = await db.userTenant.findUnique({
    where: {
      userId_tenantId: { userId: session.userId, tenantId: session.tenantId },
    },
    select: { role: true },
  });
  if (!membership) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {});
    return res.status(401).json({ error: "Unauthorized" });
  }

  (req as AuthedRequest).auth = {
    userId: session.userId,
    tenantId: session.tenantId,
    sessionId: session.id,
    role: membership.role,
  };
  next();
}

// Route-level gate: require the caller to hold one of the listed roles in the
// CURRENT shop. Attach AFTER requireAuth (reads req.auth).
//
//  OWNER  -> everything incl. products, members, invites
//  STAFF  -> sells, payments, credit, stock, customers  (NOT products/members)
//  VIEW   -> read-only
export function requireRole(...roles: MembershipRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req as AuthedRequest).auth?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

export const NOT_VIEW = [MembershipRole.OWNER, MembershipRole.STAFF] as const;