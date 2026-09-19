import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from "react";

import { api, setAuthToken } from "@/lib/api";

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
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: SignUpInput) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);

  const applySession = useCallback((session: Session) => {
    setAuthToken(session.token);
    setUser(session.user);
    setTenant(session.tenant);
  }, []);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    setUser(null);
    setTenant(null);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      applySession(
        await api<Session>("/auth/login", { method: "POST", body: { email, password } }),
      );
    },
    [applySession],
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      applySession(
        await api<Session>("/auth/register", { method: "POST", body: input }),
      );
    },
    [applySession],
  );

  const signOut = useCallback(async () => {
    // Best-effort revoke on the server; the in-memory token dies with the app
    // in any case, so a failed revoke is not worth blocking on.
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    clearSession();
  }, [clearSession]);

  const value = useMemo(
    () => ({ user, tenant, isSignedIn: user !== null, signIn, signUp, signOut }),
    [user, tenant, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>");
  return context;
}