import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { UsageReport } from "../lib/types";

interface UseLocalUsageReturn {
  report: UsageReport | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const REFRESH_INTERVAL_MS = 30_000;

export function useLocalUsage(): UseLocalUsageReturn {
  const [report, setReport] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(() => {
    setLoading(true);
    invoke<UsageReport>("get_local_usage")
      .then((r) => {
        setReport(r);
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

  return { report, loading, error, refresh: fetch };
}
