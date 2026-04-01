import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SubscriptionUsage } from "../lib/types";

interface UseSubscriptionUsageReturn {
  usage: SubscriptionUsage | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const REFRESH_INTERVAL_MS = 30_000;

export function useSubscriptionUsage(): UseSubscriptionUsageReturn {
  const [usage, setUsage] = useState<SubscriptionUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    setLoading(true);
    invoke<SubscriptionUsage>("get_subscription_usage")
      .then((r) => {
        setUsage(r);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetch]);

  return { usage, loading, error, refresh: fetch };
}
