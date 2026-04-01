import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AuthState } from "../lib/types";

interface ValidateResult {
  valid: boolean;
  key_type: string;
  error: string | null;
}

interface StoredCredentials {
  api_key: string;
  key_type: string;
}

interface UseAuthReturn {
  auth: AuthState | null;
  loading: boolean;
  login: (apiKey: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, restore session from OS keychain
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
      .catch(() => {
        // Keychain unavailable or no stored creds — start unauthenticated
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(
    async (apiKey: string): Promise<{ success: boolean; error?: string }> => {
      const result = await invoke<ValidateResult>("validate_api_key", {
        apiKey,
      });

      if (!result.valid) {
        return { success: false, error: result.error ?? "Invalid API key." };
      }

      const keyType = result.key_type as "admin" | "personal";

      await invoke("store_credentials", { apiKey, keyType });

      setAuth({ apiKey, keyType });
      return { success: true };
    },
    []
  );

  const logout = useCallback(async () => {
    await invoke("clear_credentials").catch(() => {});
    setAuth(null);
  }, []);

  return { auth, loading, login, logout };
}
