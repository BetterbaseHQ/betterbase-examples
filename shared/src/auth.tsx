import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from "react";
import { OAuthClient } from "@betterbase/sdk/auth";
import { useAuth as useAuthBase } from "@betterbase/sdk/auth/react";

const CLIENT_ID_KEY = "oauth_client_id";

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
  session: import("@betterbase/sdk/auth").AuthSession | null;
  getToken: () => Promise<string | null>;
  encryptionKey: Uint8Array | null;
  epochKey: Uint8Array | null;
  personalSpaceId: string | null;
  keypair: { privateKeyJwk: JsonWebKey; publicKeyJwk: JsonWebKey } | null;
  handle: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
  clientId: string;
  setClientId: (id: string) => void;
  hasBuiltInClientId: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  domain = "localhost:5377",
  clientId: bakedClientId = "",
  scope = "openid email sync",
}: AuthProviderProps) {
  const [clientId, setClientIdState] = useState(
    () => bakedClientId || localStorage.getItem(CLIENT_ID_KEY) || "",
  );

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

  const setClientId = useCallback((id: string) => {
    setClientIdState(id);
    localStorage.setItem(CLIENT_ID_KEY, id);
  }, []);

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

  return (
    <AuthContext.Provider
      value={{
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
        setClientId,
        hasBuiltInClientId: !!bakedClientId,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
