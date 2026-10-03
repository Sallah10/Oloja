import { Router } from "express";
import { z } from "zod";

import { db } from "../lib/db.js";
import { HttpError, asyncHandler } from "../lib/http-error.js";
import { pushConfigured, sendPush, type PushMessage } from "../lib/push.js";
import { AuthedRequest, requireAuth, requireRole } from "../middleware/auth.js";
import { MembershipRole } from "@prisma/client";

/**
 * Device push registration. One row per phone install (token is globally
 * unique), always scoped to the shop the session is currently on - so switching
 * shops moves the phone's registration instead of duplicating it.
 */
export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

const registerSchema = z.object({
  token: z.string().trim().min(16).max(200),
  platform: z.enum(["android", "ios", "web"]),
});

notificationsRouter.post(
  "/notifications/devices",
  asyncHandler(async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    const input = registerSchema.parse(req.body);

    await db.deviceToken.upsert({
      where: { token: input.token },
      create: {
        tenantId: auth.tenantId,
        token: input.token,
        platform: input.platform,
      },
      // A token that reappears belongs to whichever shop is open now.
      update: { tenantId: auth.tenantId, platform: input.platform, lastSeenAt: new Date() },
    });

    res.status(201).json({ ok: true, configured: pushConfigured() });
  }),
);

/**
 * Called on sign-out so a shared phone stops receiving the shop's alerts.
 * Scoped to THIS phone's token: signing out on one handset must not unregister
 * the owner's other phones.
 */
notificationsRouter.delete(
  "/notifications/devices",
  asyncHandler(async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    const input = z.object({ token: z.string().trim().min(16).max(200) }).parse(req.body ?? {});
    const { count } = await db.deviceToken.deleteMany({
      where: { tenantId: auth.tenantId, token: input.token },
    });
    res.json({ ok: true, removed: count });
  }),
);

notificationsRouter.get(
  "/notifications/devices",
  requireRole(MembershipRole.OWNER),
  asyncHandler(async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    const rows = await db.deviceToken.findMany({
      where: { tenantId: auth.tenantId },
      select: { id: true, platform: true, createdAt: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
    });
    res.json({ devices: rows, configured: pushConfigured() });
  }),
);

/**
 * Sends one push to every registered device of this shop and drops the tokens
 * Expo reports as dead, so a reinstalled app stops being chased.
 */
notificationsRouter.post(
  "/notifications/test",
  requireRole(MembershipRole.OWNER),
  asyncHandler(async (req, res) => {
    const auth = (req as AuthedRequest).auth;
    const rows = await db.deviceToken.findMany({
      where: { tenantId: auth.tenantId },
      select: { token: true },
    });
    if (rows.length === 0) {
      throw new HttpError(400, "No phone is registered for push on this device yet");
    }

    const messages: PushMessage[] = rows.map((row) => ({
      to: row.token,
      title: "Oloja is talking to your phone",
      body: "If you can read this, shelf alerts will reach you even when the app is closed.",
      data: { screen: "whisper" },
    }));

    const result = await sendPush(messages);
    if (result.dead.length > 0) {
      await db.deviceToken.deleteMany({ where: { token: { in: result.dead } } });
    }

    res.json({ ...result, devices: rows.length });
  }),
);