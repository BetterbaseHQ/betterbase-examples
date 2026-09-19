import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { OAuthClient, type AuthSession } from "betterbase/auth";
import { useAuth as useAuthBase } from "betterbase/auth/react";

export interface AuthProviderProps {
  children: ReactNode;
  /** Auth server domain (default: "localhost:5377") */
  domain?: string;
  /** Pre-configured OAuth client ID (e.g. from VITE_OAUTH_CLIENT_ID) */
  clientId?: string;
  /** OAuth scopes to request (default: "openid email sync") */
  scope?: string;
}

export interface AuthContextValue {
  session: AuthSession | null;
  getToken: () => Promise<string | null>;
  encryptionKey: CryptoKey | null;
  epochKey: CryptoKey | null;
  personalSpaceId: string | null;
  keypair: { privateKeyJwk: JsonWebKey; publicKeyJwk: JsonWebKey } | null;
  handle: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Login or session error, or null. Render this near the action that failed. */
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
  /** The configured OAuth client ID (empty string when unset) */
  clientId: string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  domain = "localhost:5377",
  clientId = "",
  scope = "openid email sync",
}: AuthProviderProps) {
  const client = useMemo(
    () =>
      clientId
        ? new OAuthClient({
            clientId,
            redirectUri: window.location.origin + "/",
            domain,
            scope,
          })
        : null,
    [clientId, domain, scope],
  );

  const {
    session,
    isAuthenticated,
    isLoading: sessionLoading,
    error: sessionError,
    logout: sessionLogout,
    getToken,
    encryptionKey,
    epochKey,
    personalSpaceId,
    keypair,
    handle,
  } = useAuthBase(client);

  const [loginError, setLoginError] = useState<string | null>(null);

  const login = useCallback(async () => {
    if (!client) {
      setLoginError("Please configure a Client ID first");
      return;
    }
    setLoginError(null);
    try {
      await client.startAuth();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    }
  }, [client]);

  const logout = useCallback(() => {
    sessionLogout();
    setLoginError(null);
  }, [sessionLogout]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      getToken,
      encryptionKey,
      epochKey,
      personalSpaceId,
      keypair,
      handle,
      isAuthenticated,
      isLoading: sessionLoading,
      error: loginError ?? sessionError,
      login,
      logout,
      clientId,
    }),
    [
      session,
      getToken,
      encryptionKey,
      epochKey,
      personalSpaceId,
      keypair,
      handle,
      isAuthenticated,
      sessionLoading,
      loginError,
      sessionError,
      login,
      logout,
      clientId,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
