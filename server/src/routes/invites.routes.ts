import { MembershipRole } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";

import { HttpError, asyncHandler } from "../lib/http-error.js";
import { db } from "../lib/db.js";
import { runIdempotent } from "../lib/idempotency.js";
import { tenantScoped } from "../lib/scoped.js";
import { AuthedRequest, requireAuth, requireRole } from "../middleware/auth.js";

export const invitesRouter = Router();

invitesRouter.use(requireAuth);

// One disposable code per shop at a time. 8 chars from an unambiguous alphabet
// (no I/O/0/1), valid for one week. The OWNER regenerates to invalidate old.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function randomCode(): string {
  const bytes = randomBytes(8);
  let code = "";
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

const roleSchema = z.object({ role: z.nativeEnum(MembershipRole) });

// ---- Owner-only: shop members + the current active invite ------------------

invitesRouter.get(
  "/",
  requireRole(MembershipRole.OWNER),
  asyncHandler(async (req, res) => {
    const { tenantId } = (req as AuthedRequest).auth;
    const scoped = tenantScoped(tenantId);

    const [invite, members] = await Promise.all([
      scoped.invitation.findFirst({
        where: { usedAt: null, expiresAt: { gte: new Date() } },
        orderBy: { createdAt: "desc" },
        select: { code: true, expiresAt: true },
      }),
      scoped.userTenant.findMany({
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    res.json({
      invite: invite ?? null,
      members: members.map((m) => ({
        id: m.id,
        userId: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt,
      })),
    });
  }),
);

// Owner taps "share code" -> old unused codes die, a fresh one is minted.
// Idempotent like every other mutation, so a replay can't burn two codes.
invitesRouter.post(
  "/",
  requireRole(MembershipRole.OWNER),
  asyncHandler(async (req, res) => {
    const { tenantId } = (req as AuthedRequest).auth;
    const scoped = tenantScoped(tenantId);
    const idempotencyKey = z.string().min(8).max(128).optional().parse(req.body.idempotencyKey);

    const { code, expiresAt } = await runIdempotent(
      scoped,
      tenantId,
      idempotencyKey,
      "POST",
      "/api/invites",
      async (tx) => {
        await tx.invitation.deleteMany({ where: { usedAt: null } });

        // The code column is globally unique. We just deleted our own codes,
        // so any remaining collision can only belong to ANOTHER tenant - retry.
        let code = randomCode();
        for (let attempt = 0; attempt < 5; attempt++) {
          // Deliberately unscoped uniqueness probe; acceptable here (metal of
          // the code system), never used for business rows.
          const clash = await db.invitation.findUnique({ where: { code } });
          if (!clash) break;
          code = randomCode();
        }

        const invite = await tx.invitation.create({
          data: {
            tenantId,
            code,
            createdById: (req as AuthedRequest).auth.userId,
            expiresAt: new Date(Date.now() + INVITE_TTL_MS),
          },
          select: { code: true, expiresAt: true },
        });
        return invite;
      },
    );

    res.status(201).json({ code, expiresAt });
  }),
);

// ---- Anyone signed in: join a shop with a code ------------------------------
// Deliberately NOT tenant-scoped: the caller has no membership yet - that is
// the whole point. The only cross-tenant read in the business layer.
invitesRouter.post(
  "/accept",
  asyncHandler(async (req, res) => {
    const body = z
      .object({ code: z.string().trim().min(4).max(16), idempotencyKey: z.string().min(8).max(128).optional() })
      .parse(req.body);
    const { userId } = (req as AuthedRequest).auth;

    const invite = await db.invitation.findUnique({
      where: { code: body.code.toUpperCase() },
      include: { tenant: { select: { id: true, name: true } } },
    });
    if (!invite) throw new HttpError(404, "That invite code doesn't exist");
    if (invite.usedAt) throw new HttpError(410, "That invite code has already been used");
    if (invite.expiresAt < new Date()) throw new HttpError(410, "That invite code has expired");

    const existingMember = await db.userTenant.findFirst({
      where: { userId, tenantId: invite.tenantId },
    });
    if (existingMember) throw new HttpError(409, "You're already a member of that shop");

    const { tenant, role } = await runIdempotent(
      tenantScoped(invite.tenantId),
      invite.tenantId,
      body.idempotencyKey,
      "POST",
      "/api/invites/accept",
      async (tx) => {
        await tx.userTenant.create({
          data: { userId, tenantId: invite.tenantId, role: MembershipRole.STAFF },
        });
        await tx.invitation.updateMany({
          where: { id: invite.id },
          data: { usedAt: new Date() },
        });
        return { tenant: { id: invite.tenant.id, name: invite.tenant.name }, role: MembershipRole.STAFF };
      },
    );

    res.status(201).json({ tenant, role });
  }),
);

// ---- Owner-only: manage members ---------------------------------------------

invitesRouter.patch(
  "/members/:id",
  requireRole(MembershipRole.OWNER),
  asyncHandler(async (req, res) => {
    const { tenantId } = (req as AuthedRequest).auth;
    const input = roleSchema.parse(req.body);
    const scoped = tenantScoped(tenantId);

    const member = await scoped.userTenant.findFirst({ where: { id: req.params.id } });
    if (!member) throw new HttpError(404, "Member not found");
    if (member.role === MembershipRole.OWNER) {
      throw new HttpError(400, "The shop owner's role can't be changed");
    }

    await scoped.userTenant.updateMany({ where: { id: member.id }, data: { role: input.role } });
    res.json({ ok: true, role: input.role });
  }),
);

invitesRouter.delete(
  "/members/:id",
  requireRole(MembershipRole.OWNER),
  asyncHandler(async (req, res) => {
    const { tenantId } = (req as AuthedRequest).auth;
    const scoped = tenantScoped(tenantId);

    const member = await scoped.userTenant.findFirst({ where: { id: req.params.id } });
    if (!member) throw new HttpError(404, "Member not found");
    if (member.role === MembershipRole.OWNER) {
      throw new HttpError(400, "The shop owner can't be removed");
    }

    await scoped.userTenant.deleteMany({ where: { id: member.id } });
    res.json({ ok: true });
  }),
);