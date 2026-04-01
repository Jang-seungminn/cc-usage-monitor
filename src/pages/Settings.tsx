import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAuth } from "../hooks/useAuth";
import type { PlanSettings } from "../lib/types";
import { DEFAULT_PLAN_SETTINGS } from "../lib/types";
import "../styles/Settings.css";

const WEEK_DAYS = [
  { value: "monday", label: "월요일" },
  { value: "tuesday", label: "화요일" },
  { value: "wednesday", label: "수요일" },
  { value: "thursday", label: "목요일" },
  { value: "friday", label: "금요일" },
  { value: "saturday", label: "토요일" },
  { value: "sunday", label: "일요일" },
] as const;

const PLAN_PRESETS: Record<string, Partial<PlanSettings>> = {
  pro: { session_limit: 45, weekly_limit: 225, session_reset_hours: 5 },
  team: { session_limit: 45, weekly_limit: 450, session_reset_hours: 5 },
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function Settings() {
  const { logout } = useAuth();
  const [form, setForm] = useState<PlanSettings>(DEFAULT_PLAN_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    invoke<PlanSettings>("get_plan_settings")
      .then((s) => setForm(s))
      .catch(() => setForm(DEFAULT_PLAN_SETTINGS))
      .finally(() => setLoading(false));
  }, []);

  function handlePlanTypeChange(plan_type: "pro" | "team") {
    const preset = PLAN_PRESETS[plan_type] ?? {};
    setForm((f) => ({ ...f, plan_type, ...preset }));
    setSaveState("idle");
  }

  function handleChange(field: keyof PlanSettings, value: string | number) {
    setForm((f) => ({ ...f, [field]: value }));
    setSaveState("idle");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveState("saving");
    setErrorMsg(null);
    try {
      await invoke("save_plan_settings", { settings: form });
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } catch (err) {
      setErrorMsg(String(err));
      setSaveState("error");
    }
  }

  return (
    <div className="settings-root">
      <header className="settings-topbar">
        <div className="settings-topbar-left">
          <span className="settings-logo-icon">⚡</span>
          <span className="settings-topbar-title">설정</span>
        </div>
        <div className="settings-topbar-right">
          <button className="pd-logout-btn" onClick={logout}>
            로그아웃
          </button>
        </div>
      </header>

      <main className="settings-content">
        {loading ? (
          <div className="settings-loading">
            <span className="login-spinner" />
            설정 불러오는 중…
          </div>
        ) : (
          <form className="settings-form" onSubmit={handleSave}>
            <section className="settings-section">
              <h2 className="settings-section-title">플랜 설정</h2>
              <p className="settings-section-desc">
                구독 플랜 및 사용량 한도를 설정합니다. 선택 시 기본값이 자동으로 채워집니다.
              </p>

              {/* Plan type */}
              <div className="settings-field">
                <label className="settings-label">플랜 타입</label>
                <div className="settings-plan-toggle">
                  {(["pro", "team"] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      className={`settings-plan-btn${form.plan_type === p ? " settings-plan-btn--active" : ""}`}
                      onClick={() => handlePlanTypeChange(p)}
                    >
                      {p === "pro" ? "Claude Pro" : "Claude Team"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Session limit */}
              <div className="settings-field">
                <label className="settings-label" htmlFor="session_limit">
                  세션 메시지 한도
                </label>
                <div className="settings-input-row">
                  <input
                    id="session_limit"
                    type="number"
                    min={1}
                    max={9999}
                    className="settings-input"
                    value={form.session_limit}
                    onChange={(e) =>
                      handleChange("session_limit", parseInt(e.target.value, 10) || 1)
                    }
                  />
                  <span className="settings-unit">메시지 / 세션</span>
                </div>
                <p className="settings-hint">한 세션에서 보낼 수 있는 최대 메시지 수</p>
              </div>

              {/* Weekly limit */}
              <div className="settings-field">
                <label className="settings-label" htmlFor="weekly_limit">
                  주간 메시지 한도
                </label>
                <div className="settings-input-row">
                  <input
                    id="weekly_limit"
                    type="number"
                    min={1}
                    max={99999}
                    className="settings-input"
                    value={form.weekly_limit}
                    onChange={(e) =>
                      handleChange("weekly_limit", parseInt(e.target.value, 10) || 1)
                    }
                  />
                  <span className="settings-unit">메시지 / 주</span>
                </div>
                <p className="settings-hint">한 주에 보낼 수 있는 최대 메시지 수</p>
              </div>

              {/* Session reset hours */}
              <div className="settings-field">
                <label className="settings-label" htmlFor="session_reset_hours">
                  세션 리셋 주기
                </label>
                <div className="settings-input-row">
                  <input
                    id="session_reset_hours"
                    type="number"
                    min={0.5}
                    max={24}
                    step={0.5}
                    className="settings-input"
                    value={form.session_reset_hours}
                    onChange={(e) =>
                      handleChange("session_reset_hours", parseFloat(e.target.value) || 5)
                    }
                  />
                  <span className="settings-unit">시간</span>
                </div>
                <p className="settings-hint">
                  Claude Pro 기준 약 5시간마다 세션 한도가 리셋됩니다
                </p>
              </div>

              {/* Weekly reset day */}
              <div className="settings-field">
                <label className="settings-label" htmlFor="weekly_reset_day">
                  주간 리셋 요일
                </label>
                <select
                  id="weekly_reset_day"
                  className="settings-select"
                  value={form.weekly_reset_day}
                  onChange={(e) => handleChange("weekly_reset_day", e.target.value)}
                >
                  {WEEK_DAYS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <p className="settings-hint">매주 해당 요일 00:00에 주간 한도가 리셋됩니다</p>
              </div>
            </section>

            {errorMsg && (
              <div className="settings-error">저장 실패: {errorMsg}</div>
            )}

            <div className="settings-actions">
              <button
                type="submit"
                className={`settings-save-btn${saveState === "saved" ? " settings-save-btn--saved" : ""}`}
                disabled={saveState === "saving"}
              >
                {saveState === "saving"
                  ? "저장 중…"
                  : saveState === "saved"
                  ? "✓ 저장됨"
                  : "저장"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
