import { NextFunction, Request, Response } from "express";

import { db } from "../lib/db.js";
import { hashToken } from "../lib/tokens.js";

export type AuthContext = {
  userId: string;
  tenantId: string;
  sessionId: string;
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

  (req as AuthedRequest).auth = {
    userId: session.userId,
    tenantId: session.tenantId,
    sessionId: session.id,
  };
  next();
}