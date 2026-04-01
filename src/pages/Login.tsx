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
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const keyType = detectKeyType(apiKey.trim());

  async function handleSubmit(e: React.FormEvent) {
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
        setError(result.error ?? "Could not authenticate.");
      }
    } catch {
      setError("Unexpected error. Is the app running correctly?");
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
          Connect with your Anthropic API key to get started.
        </p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="apiKey" className="login-label">
              API Key
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
                Connecting…
              </>
            ) : (
              "Connect"
            )}
          </button>
        </form>

        <p className="login-hint">
          Admin keys unlock org-wide usage. Personal keys show individual usage
          only.
        </p>
      </div>
    </main>
  );
}
