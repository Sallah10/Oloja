import { Platform } from "react-native";
import Storage from "expo-sqlite/kv-store";

import type { WhisperCard } from "./whisper";

/**
 * Notifications live on-device: the daily whisper digest is a repeating local
 * notification scheduled at a time the owner picks, and urgent ledger events
 * (out of stock, low stock, a balance clearing) ping immediately while the app
 * is open. Both can be switched off in Settings - nothing fires without a
 * granted permission, and web keeps its quiet (the whisper screen is the word
 * there).
 *
 * The expo-notifications module is loaded lazily (never on web) so the static
 * web export and the offline mirror never touch it.
 */

const SETTINGS_KEY = "oloja/notifications";
const DAILY_ID = "oloja-daily-whisper";
const CHANNEL_ID = "oloja-whisper";

export type NotificationSettings = {
  /** The repeating daily whisper digest. */
  dailyEnabled: boolean;
  dailyHour: number;
  dailyMinute: number;
  /** Event pings: urgent ledger moments, e.g. out of stock, a cleared balance. */
  eventEnabled: boolean;
  /** alert id -> the day it last fired, so the same nudge can't repeat-day. */
  lastFired: Record<string, string>;
};

const DEFAULTS: NotificationSettings = {
  dailyEnabled: false,
  dailyHour: 9,
  dailyMinute: 0,
  eventEnabled: true,
  lastFired: {},
};

let cached: NotificationSettings | null = null;

async function loadSettings(): Promise<NotificationSettings> {
  if (cached) return cached;
  const raw = await Storage.getItemAsync(SETTINGS_KEY);
  let parsed: NotificationSettings | null = null;
  if (raw) {
    try {
      parsed = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<NotificationSettings>) };
    } catch {
      parsed = null;
    }
  }
  cached = parsed ?? { ...DEFAULTS };
  return cached;
}

async function save(next: NotificationSettings): Promise<void> {
  cached = next;
  await Storage.setItemAsync(SETTINGS_KEY, JSON.stringify(next));
}

/** Synchronous read for screens that render before the async load finishes. */
export function cachedNotificationSettings(): NotificationSettings {
  return cached ? { ...cached } : { ...DEFAULTS };
}

export function notificationsSupported(): boolean {
  return Platform.OS !== "web";
}

/** Lazy module so the web bundle and offline paths never evaluate it. */
function notifications(): Promise<typeof import("expo-notifications")> {
  return import("expo-notifications");
}

async function setUpChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    const Notifications = await notifications();
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: "The whisper",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch {
    // Expo Go or a fresh build without the channel - scheduling still works.
  }
}

/** Register the in-foreground handler once (fire-and-forget, native only). */
export async function setUpForegroundHandler(): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    const Notifications = await notifications();
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch {
    // Unsupported environments simply stay quiet.
  }
}

export async function hasPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const Notifications = await notifications();
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

/** Ask once, set the channel if granted. Call only on the owner's tap. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  try {
    const Notifications = await notifications();
    const current = await Notifications.getPermissionsAsync();
    const result = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!result.granted) return false;
    await setUpChannel();
    return true;
  } catch {
    return false;
  }
}

/** Sync the repeating daily digest with the saved settings. */
async function applyDailySchedule(settings: NotificationSettings): Promise<void> {
  if (!notificationsSupported()) return;
  try {
    const Notifications = await notifications();
    await Notifications.cancelScheduledNotificationAsync(DAILY_ID).catch(() => {});
    if (!settings.dailyEnabled) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    await setUpChannel();
    await Notifications.scheduleNotificationAsync({
      identifier: DAILY_ID,
      content: {
        title: "Oloja · the whisper",
        body: "Today's read is waiting in your ledger - stock, debts and the shape of your money.",
        sound: "default",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: settings.dailyHour,
        minute: settings.dailyMinute,
        channelId: CHANNEL_ID,
      },
    });
  } catch {
    // Keep quiet rather than fail loudly on a first-run surface.
  }
}

export async function updateNotificationSettings(
  patch: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const next = { ...(await loadSettings()), ...patch };
  await save(next);
  await applyDailySchedule(next);
  return next;
}

/** Called once at app boot: warm the cache and re-apply the daily digest. */
export async function bootstrapNotifications(): Promise<void> {
  if (!notificationsSupported()) return;
  const settings = await loadSettings();
  void setUpForegroundHandler();
  await applyDailySchedule(settings);
}

const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Ping the owner once for the urgent cards present right now. Each card can
 * only fire once a day, and at most one nudge a day - the whisper app is the
 * place for the full list, not the lock screen.
 */
export async function notifyUrgentCards(cards: WhisperCard[]): Promise<void> {
  if (!notificationsSupported()) return;
  const urgent = cards.filter((c) => c.tone === "danger");
  if (urgent.length === 0) return;
  const settings = await loadSettings();
  if (!settings.eventEnabled) return;
  const today = todayKey();
  const first = urgent.find((c) => settings.lastFired[c.id] !== today);
  if (!first) return;
  try {
    const Notifications = await notifications();
    await Notifications.presentNotificationAsync({
      title: `Oloja · ${first.title}`,
      body: first.body,
      sound: "default",
    });
    settings.lastFired[first.id] = today;
    await save(settings);
  } catch {
    // If the device can't show it now, the whisper screen still has the word.
  }
}

/** A pleasant ping the moment an old balance clears to zero. */
export async function notifyBalanceCleared(customerName: string): Promise<void> {
  if (!notificationsSupported()) return;
  const settings = await loadSettings();
  if (!settings.eventEnabled) return;
  try {
    const Notifications = await notifications();
    await Notifications.presentNotificationAsync({
      title: `${customerName} is all paid up`,
      body: "Their balance just cleared to zero. One less thing to chase.",
      sound: "default",
    });
  } catch {
    // Quiet by design.
  }
}

/** Wipe the fire-once record when the ledger is reset for a new shop. */
export async function resetNotificationState(): Promise<void> {
  const settings = await loadSettings();
  await save({ ...settings, lastFired: {} });
}