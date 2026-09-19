import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, isMockMode, rawRequest, setAuthToken } from "@/lib/api";
import {
  registerLifecycleSync,
  requestSync,
  resetOffline,
} from "@/lib/offline";
import { clearSession as clearStoredSession, loadSession, saveSession } from "@/lib/session";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

export type AuthTenant = {
  id: string;
  name: string;
};

type Session = {
  token: string;
  user: AuthUser;
  tenant: AuthTenant;
};

type SignUpInput = {
  tenantName: string;
  ownerName: string;
  email: string;
  password: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  isSignedIn: boolean;
  isRestoring: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);

  const applySession = useCallback((session: Session) => {
    setAuthToken(session.token);
    setUser(session.user);
    setTenant(session.tenant);
  }, []);

  const clearUser = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setTenant(null);
  }, []);

  // Cold start: if a session was saved before the app was killed, restore it
  // so an OFFLINE launch skips login entirely (the mirror serves the data).
  // This resolver registers the foreground-resync hook once per launch.
  useEffect(() => {
    registerLifecycleSync(rawRequest);
    let cancelled = false;
    void (async () => {
      const stored = await loadSession();
      if (cancelled) return;
      if (stored && !isMockMode) {
        applySession(stored);
        void requestSync(rawRequest);
      }
      setIsRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      // A new session could belong to a different shop; clear this device's
      // previous mirror/outbox so no one's data leaks across accounts.
      await resetOffline();
      const session = await api<Session>("/auth/login", { method: "POST", body: { email, password } });
      applySession(session);
      if (!isMockMode) await saveSession(session);
      void requestSync(rawRequest);
    },
    [applySession],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      await resetOffline();
      const session = await api<Session>("/auth/register", { method: "POST", body: input });
      applySession(session);
      if (!isMockMode) await saveSession(session);
      void requestSync(rawRequest);
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    // Best-effort revoke on the server; the local token dies regardless.
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    clearUser();
    await resetOffline();
    if (!isMockMode) await clearStoredSession();
  }, [clearUser]);

  const value = useMemo(
    () => ({
      user,
      tenant,
      isSignedIn: user !== null,
      isRestoring,
      signIn,
      signUp,
      signOut,
    }),
    [user, tenant, isRestoring, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}