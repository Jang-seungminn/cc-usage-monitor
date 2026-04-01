import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import "../styles/Login.css";

function detectKeyType(key: string): "admin" | "personal" | null {
  if (key.startsWith("sk-ant-admin")) return "admin";
  if (key.startsWith("sk-ant-")) return "personal";
  return null;
}

export default function Login() {
  const [mode, setMode] = useState<"choose" | "api">("choose");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const { login, loginAsSubscription } = useAuth();
  const navigate = useNavigate();

  const keyType = detectKeyType(apiKey.trim());

  function handleSubscription() {
    loginAsSubscription();
    navigate("/personal");
  }

  async function handleApiSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedKey = apiKey.trim();
    if (!trimmedKey || validating) return;

    setError(null);
    setValidating(true);

    try {
      const result = await login(trimmedKey);
      if (result.success) {
        navigate(detectKeyType(trimmedKey) === "admin" ? "/dashboard" : "/personal");
      } else {
        setError(result.error ?? "인증에 실패했습니다.");
      }
    } catch {
      setError("오류가 발생했습니다. 앱이 정상적으로 실행 중인지 확인해주세요.");
    } finally {
      setValidating(false);
    }
  }

  return (
    <main className="login-root">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-icon">⚡</span>
          <h1 className="login-title">cc-usage-monitor</h1>
        </div>
        <p className="login-subtitle">
          Claude 사용량을 모니터링합니다. 사용 유형을 선택하세요.
        </p>

        {mode === "choose" && (
          <div className="login-choose">
            <button
              className="login-choose-btn login-choose-btn--sub"
              onClick={handleSubscription}
            >
              <span className="login-choose-icon">🎫</span>
              <span className="login-choose-label">구독형 (Pro/Team)</span>
              <span className="login-choose-desc">
                로컬 사용 데이터를 기반으로 사용량을 확인합니다. API 키가 필요 없습니다.
              </span>
            </button>
            <button
              className="login-choose-btn login-choose-btn--api"
              onClick={() => setMode("api")}
            >
              <span className="login-choose-icon">🔑</span>
              <span className="login-choose-label">API 사용자</span>
              <span className="login-choose-desc">
                Anthropic API 키로 로그인합니다. 조직 관리자는 Admin 키를 사용하세요.
              </span>
            </button>
          </div>
        )}

        {mode === "api" && (
          <>
            <form onSubmit={handleApiSubmit} className="login-form">
              <div className="login-field">
                <label htmlFor="apiKey" className="login-label">
                  API 키
                  {keyType && (
                    <span className={`login-badge login-badge--${keyType}`}>
                      {keyType === "admin" ? "Admin" : "Personal"}
                    </span>
                  )}
                </label>
                <input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setError(null);
                  }}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                  autoFocus
                  required
                  className={`login-input${error ? " login-input--error" : ""}`}
                />
                {error && <p className="login-error">{error}</p>}
              </div>

              <button
                type="submit"
                className="login-btn"
                disabled={!apiKey.trim() || validating}
              >
                {validating ? (
                  <>
                    <span className="login-spinner" />
                    연결 중…
                  </>
                ) : (
                  "연결"
                )}
              </button>
            </form>

            <button
              className="login-back-btn"
              onClick={() => { setMode("choose"); setError(null); setApiKey(""); }}
            >
              ← 돌아가기
            </button>

            <p className="login-hint">
              Admin 키는 조직 전체 사용량을 볼 수 있습니다. Personal 키는 개인
              사용량만 표시됩니다.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
