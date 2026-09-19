import Storage from "expo-sqlite/kv-store";

// The signed-in session, kept in SQLite-backed storage so the app can open
// OFFLINE without a re-login (part of Phase 5). The raw token lives here in
// plain SQLite storage for now - a v2 should move to expo-secure-store once
// the app ships. Demo mode (mock API) never persists a fake session on
// purpose, so flipping the env toggle can't leave a stale mock login behind.
const SESSION_KEY = "oloja/session";

export type StoredSession = {
  token: string;
  user: { id: string; name: string; email: string };
  tenant: { id: string; name: string };
};

export async function saveSession(session: StoredSession): Promise<void> {
  await Storage.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function loadSession(): Promise<StoredSession | null> {
  const raw = await Storage.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export async function clearSession(): Promise<void> {
  await Storage.removeItemAsync(SESSION_KEY);
}