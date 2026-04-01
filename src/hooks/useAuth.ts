import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AuthState } from "../lib/types";
import React from "react";

interface ValidateResult {
  valid: boolean;
  key_type: string;
  error: string | null;
}

interface StoredCredentials {
  api_key: string;
  key_type: string;
}

interface AuthContextValue {
  auth: AuthState | null;
  loading: boolean;
  login: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  loginAsSubscription: () => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    invoke<StoredCredentials | null>("get_stored_credentials")
      .then((creds) => {
        if (creds) {
          setAuth({
            apiKey: creds.api_key,
            keyType: creds.key_type as "admin" | "personal",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (apiKey: string): Promise<{ success: boolean; error?: string }> => {
      const result = await invoke<ValidateResult>("validate_api_key", {
        apiKey,
      });

      if (!result.valid) {
        return { success: false, error: result.error ?? "유효하지 않은 API 키입니다." };
      }

      const keyType = result.key_type as "admin" | "personal";
      await invoke("store_credentials", { apiKey, keyType });
      setAuth({ apiKey, keyType });
      return { success: true };
    },
    []
  );

  const loginAsSubscription = useCallback(() => {
    setAuth({ apiKey: null, keyType: "subscription" });
  }, []);

  const logout = useCallback(async () => {
    await invoke("clear_credentials").catch(() => {});
    setAuth(null);
  }, []);

  const value = { auth, loading, login, loginAsSubscription, logout };

  return React.createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
