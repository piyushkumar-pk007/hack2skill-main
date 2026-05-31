import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@shared/types";
import { ApiClient } from "../lib/api";
import { STORAGE_KEYS } from "../lib/config";
import type { AuthSessionResponse } from "../types/api";

interface StoredSession {
  accessToken: string;
  user: User;
}

interface AuthContextValue {
  accessToken: string | null;
  status: "checking" | "authenticated" | "anonymous";
  user: User | null;
  lastTripId: string | null;
  apiClient: ApiClient;
  login: (input: { email: string; password: string }) => Promise<void>;
  register: (input: { email: string; password: string; displayName: string; timezone: string }) => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  logout: () => Promise<void>;
  rememberTrip: (tripId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredSession(): StoredSession | null {
  const raw = localStorage.getItem(STORAGE_KEYS.session);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.accessToken === "string" && parsed.user && typeof parsed.user === "object") {
      return parsed as StoredSession;
    }
  } catch {
    localStorage.removeItem(STORAGE_KEYS.session);
  }

  return null;
}

function readLastTripId() {
  return localStorage.getItem(STORAGE_KEYS.lastTripId);
}

function persistSession(session: AuthSessionResponse | null) {
  if (!session) {
    localStorage.removeItem(STORAGE_KEYS.session);
    return;
  }

  localStorage.setItem(
    STORAGE_KEYS.session,
    JSON.stringify({
      accessToken: session.accessToken,
      user: session.user,
    } satisfies StoredSession)
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialSession = typeof window === "undefined" ? null : readStoredSession();
  const [status, setStatus] = useState<"checking" | "authenticated" | "anonymous">(initialSession ? "authenticated" : "checking");
  const [accessToken, setAccessToken] = useState<string | null>(initialSession?.accessToken ?? null);
  const [user, setUser] = useState<User | null>(initialSession?.user ?? null);
  const [lastTripId, setLastTripId] = useState<string | null>(typeof window === "undefined" ? null : readLastTripId());

  const accessTokenRef = useRef<string | null>(initialSession?.accessToken ?? null);
  const apiClientRef = useRef<ApiClient | null>(null);

  const updateSession = (session: AuthSessionResponse | null) => {
    setAccessToken(session?.accessToken ?? null);
    setUser(session?.user ?? null);
    setStatus(session ? "authenticated" : "anonymous");
    accessTokenRef.current = session?.accessToken ?? null;
    persistSession(session);
  };

  const refreshAccessToken = async () => {
    try {
      const session = await apiClientRef.current!.refresh();
      updateSession(session);
      return session.accessToken;
    } catch {
      updateSession(null);
      return null;
    }
  };

  if (!apiClientRef.current) {
    apiClientRef.current = new ApiClient({
      getAccessToken: () => accessTokenRef.current,
      refreshAccessToken,
    });
  }

  useEffect(() => {
    if (initialSession) {
      return;
    }

    void (async () => {
      try {
        const session = await apiClientRef.current!.refresh();
        updateSession(session);
      } catch {
        updateSession(null);
      }
    })();
  }, [initialSession]);

  const value: AuthContextValue = {
    accessToken,
    status,
    user,
    lastTripId,
    apiClient: apiClientRef.current,
    login: async (input) => {
      const session = await apiClientRef.current!.login(input);
      updateSession(session);
    },
    register: async (input) => {
      const session = await apiClientRef.current!.register(input);
      updateSession(session);
    },
    refreshAccessToken,
    logout: async () => {
      try {
        await apiClientRef.current!.logout();
      } finally {
        updateSession(null);
      }
    },
    rememberTrip: (tripId) => {
      localStorage.setItem(STORAGE_KEYS.lastTripId, tripId);
      setLastTripId(tripId);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider.");
  }

  return context;
}
