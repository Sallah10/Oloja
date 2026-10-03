import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, isMockMode, rawRequest, setAuthToken } from "@/lib/api";
import { ApiError } from "@/lib/errors";
import {
  registerLifecycleSync,
  requestSync,
  resetOffline,
} from "@/lib/offline";
import { clearSession as clearStoredSession, loadSession, saveSession } from "@/lib/session";
import { MembershipRole, TenantMembership } from "@/lib/types";

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
  tenants: TenantMembership[];
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
  tenants: TenantMembership[];
  role: MembershipRole | null;
  isSignedIn: boolean;
  isRestoring: boolean;
  isOwner: boolean;
  canTransact: boolean;
  canManageProducts: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
  switchShop: (tenantId: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [tenants, setTenants] = useState<TenantMembership[]>([]);
  const [isRestoring, setIsRestoring] = useState(true);

  const applySession = useCallback((session: Session) => {
    setAuthToken(session.token);
    setUser(session.user);
    setTenant(session.tenant);
    setTenants(session.tenants ?? []);
  }, []);

  const clearUser = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setTenant(null);
    setTenants([]);
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
        try {
          // Validate the stored token against the server. A 401 means it was
          // revoked (logout elsewhere / expired) - drop it and go to login.
          // A network failure means we're offline: keep the stored session so
          // the mirror can serve the shop floor until the connection returns.
          const me = await rawRequest<{
            user: AuthUser;
            tenant: AuthTenant;
            tenants: TenantMembership[];
          }>("GET", "/auth/me");
          if (cancelled) return;
          applySession({ token: stored.token, ...me });
        } catch (err) {
          if (cancelled) return;
          if (err instanceof ApiError && err.status === 401) {
            await clearStoredSession();
            setIsRestoring(false);
            return;
          }
          applySession(stored);
        }
        void requestSync(rawRequest);
      }
      setIsRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  const afterLogin = useCallback(
    async (session: Session) => {
      applySession(session);
      if (!isMockMode) await saveSession(session);
      void requestSync(rawRequest);
    },
    [applySession],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      // A new session could belong to a different shop; clear this device's
      // previous mirror/outbox so no one's data leaks across accounts.
      await resetOffline();
      const session = await api<Session>("/auth/login", { method: "POST", body: { email, password } });
      await afterLogin(session);
    },
    [afterLogin],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      await resetOffline();
      const session = await api<Session>("/auth/register", { method: "POST", body: input });
      await afterLogin(session);
    },
    [afterLogin],
  );

  const signOut = useCallback(async () => {
    // Best-effort revoke on the server; the local token dies regardless.
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    clearUser();
    await resetOffline();
    if (!isMockMode) await clearStoredSession();
  }, [clearUser]);

  // Open a different shop the account already belongs to. The server mints a
  // session scoped to it; mirror/outbox reset so nobody "carries" shop B's
  // cache into shop A, then a sync round re-captures the new shop's data.
  const switchShop = useCallback(
    async (tenantId: string) => {
      if (tenantId === tenant?.id) return;
      const session = await api<Session>("/auth/switch-shop", { method: "POST", body: { tenantId } });
      await resetOffline();
      await afterLogin(session);
    },
    [tenant?.id, afterLogin],
  );

  const role = useMemo(
    () => (tenant ? (tenants.find((t) => t.tenantId === tenant.id)?.role ?? null) : null),
    [tenant, tenants],
  );

  const value = useMemo(
    () => ({
      user,
      tenant,
      tenants,
      role,
      isSignedIn: user !== null,
      isRestoring,
      isOwner: role === "OWNER",
      canTransact: role === "OWNER" || role === "STAFF",
      canManageProducts: role === "OWNER",
      signIn,
      signUp,
      signOut,
      switchShop,
    }),
    [user, tenant, tenants, role, isRestoring, signIn, signUp, signOut, switchShop],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}