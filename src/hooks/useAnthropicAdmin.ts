import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface TrackedUser {
  id: string;
  name: string;
  api_key: string;
  workspace_label?: string;
}

export interface UserUsageResult {
  user_id: string;
  name: string;
  workspace_label?: string;
  weekly_pct: number;
  session_pct: number;
  error?: string;
}

interface AdminState {
  users: UserUsageResult[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

const POLL_INTERVAL_MS = 30_000;

export function useAnthropicAdmin() {
  const [state, setState] = useState<AdminState>({
    users: [],
    loading: true,
    error: null,
    lastUpdated: null,
  });

  const isMounted = useRef(true);

  const fetchUsage = useCallback(async () => {
    try {
      const results = await invoke<UserUsageResult[]>("get_all_users_usage");
      if (!isMounted.current) return;
      setState({ users: results, loading: false, error: null, lastUpdated: new Date() });
    } catch (err) {
      if (!isMounted.current) return;
      // SKI-16 Rust backend not yet available — surface error gracefully
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        lastUpdated: new Date(),
      }));
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;
    fetchUsage();
    const timer = setInterval(fetchUsage, POLL_INTERVAL_MS);
    return () => {
      isMounted.current = false;
      clearInterval(timer);
    };
  }, [fetchUsage]);

  return { ...state, refresh: fetchUsage };
}

// ── Tracked users CRUD (backed by SKI-16 Rust commands) ──────────────────────

export function useTrackedUsers() {
  const [users, setUsers] = useState<TrackedUser[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await invoke<TrackedUser[]>("get_tracked_users");
      setUsers(list);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const addUser = useCallback(
    async (name: string, api_key: string, workspace_label?: string) => {
      const user = await invoke<TrackedUser>("add_tracked_user", {
        name,
        apiKey: api_key,
        workspaceLabel: workspace_label,
      });
      setUsers((prev) => [...prev, user]);
      return user;
    },
    []
  );

  const removeUser = useCallback(async (id: string) => {
    await invoke("remove_tracked_user", { id });
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { users, loading, addUser, removeUser, reload: load };
}
