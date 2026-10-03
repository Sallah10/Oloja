/**
 * Server-sent push through Expo's push service.
 *
 * The phone registers an Expo push token (see POST /api/notifications/devices);
 * the server keeps one row per install per shop and sends through
 * https://exp.host/--/api/v2/push/send. Nothing here touches the database - the
 * callers (routes) own the rows - so this module stays a thin, testable client.
 *
 * EXPO_ACCESS_TOKEN (expo.dev -> Access tokens) is what makes sending possible.
 * Without it `sendPush` reports "skipped" instead of throwing: a missing token
 * must never take down the business operation that triggered the notification.
 */

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo accepts at most 100 messages per request. */
const CHUNK_SIZE = 100;

export type PushMessage = {
  /** ExpoPushToken[...] from getExpoPushTokenAsync. */
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export type PushResult = {
  /** Messages Expo accepted. */
  sent: number;
  /** Tokens Expo reported as dead; the caller should delete these rows. */
  dead: string[];
  /** Messages that failed for another reason (bad payload, network, ...). */
  failed: number;
  /** True when EXPO_ACCESS_TOKEN is not configured - nothing was attempted. */
  skipped: boolean;
};

export function pushConfigured(): boolean {
  return Boolean(process.env.EXPO_ACCESS_TOKEN);
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

/** Expo says a token is dead with one of these errors; the row must go. */
const DEAD_TOKEN_ERRORS = new Set(["DeviceNotRegistered", "Unregistered"]);

function isDead(ticket: ExpoTicket | undefined): boolean {
  const error = ticket?.details?.error ?? ticket?.message;
  return error !== undefined && DEAD_TOKEN_ERRORS.has(error);
}

/**
 * Send one message per device. Never throws: a push failure must not roll back
 * or fail the sale/restock that caused it.
 */
export async function sendPush(messages: PushMessage[]): Promise<PushResult> {
  const result: PushResult = { sent: 0, dead: [], failed: 0, skipped: false };
  if (messages.length === 0) return result;

  const token = process.env.EXPO_ACCESS_TOKEN;
  if (!token) {
    result.skipped = true;
    return result;
  }

  for (const group of chunk(messages, CHUNK_SIZE)) {
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
          "accept-encoding": "gzip, deflate",
        },
        body: JSON.stringify(
          group.map((message) => ({
            to: message.to,
            title: message.title,
            body: message.body,
            data: message.data ?? {},
            sound: "default",
            // Android channel that matches the on-device notification channel,
            // so a server alert sounds like a local one.
            channelId: "oloja-whisper",
          })),
        ),
      });

      if (!response.ok) {
        result.failed += group.length;
        continue;
      }

      const body = (await response.json()) as { data?: ExpoTicket[] };
      const tickets = body.data ?? [];
      tickets.forEach((ticket, index) => {
        if (ticket.status === "ok") {
          result.sent += 1;
        } else if (isDead(ticket)) {
          const dead = group[index]?.to;
          if (dead) result.dead.push(dead);
        } else {
          result.failed += 1;
        }
      });
    } catch {
      result.failed += group.length;
    }
  }

  return result;
}