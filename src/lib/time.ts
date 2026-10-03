const LOCALE = "en-NG";

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(LOCALE, { day: "numeric", month: "short" });
}

export function formatTimeOfDay(iso: string): string {
  return new Date(iso).toLocaleTimeString(LOCALE, { hour: "numeric", minute: "2-digit" });
}

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysAgoUtcMs(days: number): number {
  return startOfDay().getTime() - days * 24 * 60 * 60 * 1000;
}

export function isSameDay(a: string | Date, b: Date): boolean {
  return new Date(a).toDateString() === b.toDateString();
}

export function isToday(iso: string): boolean {
  return isSameDay(iso, new Date());
}

export function isYesterday(iso: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return isSameDay(iso, yesterday);
}

/** Human "Today / Yesterday / Mon 21 Sep" label for grouping. */
export function dayGroupLabel(iso: string): string {
  if (isToday(iso)) return "Today";
  if (isYesterday(iso)) return "Yesterday";
  return new Date(iso).toLocaleDateString(LOCALE, { weekday: "short", day: "numeric", month: "short" });
}

export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}