import { db } from "./db.js";
import { sendPush, type PushMessage } from "./push.js";

/**
 * Fire-and-forget push to every phone registered for one shop. Business routes
 * call this AFTER their transaction committed: a failed notification must never
 * undo a recorded sale, and a shop with no phones must cost nothing.
 *
 * Tokens Expo reports as dead are deleted here, so an uninstalled app quietly
 * stops being a target instead of failing forever.
 */
export async function notifyShop(
  tenantId: string,
  message: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  try {
    const rows = await db.deviceToken.findMany({ where: { tenantId }, select: { token: true } });
    if (rows.length === 0) return;

    const messages: PushMessage[] = rows.map((row) => ({ to: row.token, ...message }));
    const result = await sendPush(messages);
    if (result.dead.length > 0) {
      await db.deviceToken.deleteMany({ where: { token: { in: result.dead } } });
    }
  } catch {
    // Quiet by design: the ledger is the truth, the notification is a courtesy.
  }
}