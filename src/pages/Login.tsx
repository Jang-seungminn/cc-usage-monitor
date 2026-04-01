import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [apiKey, setApiKey] = useState("");
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (apiKey.trim()) {
      // TODO: validate key against Anthropic API (Phase 1.2)
      sessionStorage.setItem("apiKey", apiKey.trim());
      navigate("/dashboard");
    }
  }

  return (
    <main className="login-container">
      <h1>cc-usage-monitor</h1>
      <p>Enter your Anthropic API key to continue.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-ant-..."
          autoComplete="off"
          required
        />
        <button type="submit">Connect</button>
      </form>
    </main>
  );
}
