import { useState } from "react";
import { TrackedUser, useTrackedUsers } from "../hooks/useAnthropicAdmin";
import { maskKey } from "./HorseRaceTrack";

interface Props {
  onClose: () => void;
  onSaved: () => void;
}

export default function UserManagementModal({ onClose, onSaved }: Props) {
  const { users, loading, addUser, removeUser } = useTrackedUsers();
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !apiKey.trim()) {
      setFormError("이름과 API 키를 입력해주세요.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await addUser(name.trim(), apiKey.trim(), workspace.trim() || undefined);
      setName("");
      setApiKey("");
      setWorkspace("");
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(user: TrackedUser) {
    try {
      await removeUser(user.id);
      onSaved();
    } catch {
      // ignore
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">사용자 관리</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Existing users */}
        <div className="modal-section">
          <div className="modal-section-label">추적 중인 사용자</div>
          {loading ? (
            <div className="modal-loading">불러오는 중…</div>
          ) : users.length === 0 ? (
            <div className="modal-empty">아직 추가된 사용자가 없습니다.</div>
          ) : (
            <ul className="modal-user-list">
              {users.map((u) => (
                <li key={u.id} className="modal-user-row">
                  <div className="modal-user-info">
                    <span className="modal-user-name">{u.name}</span>
                    {u.workspace_label && (
                      <span className="modal-user-ws">{u.workspace_label}</span>
                    )}
                    <span className="modal-user-key">{maskKey(u.api_key)}</span>
                  </div>
                  <button
                    className="modal-btn-remove"
                    onClick={() => handleRemove(u)}
                    title="삭제"
                  >
                    삭제
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Add form */}
        <form className="modal-section modal-form" onSubmit={handleAdd}>
          <div className="modal-section-label">사용자 추가</div>
          <div className="modal-field">
            <label className="modal-label">이름</label>
            <input
              className="modal-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              disabled={saving}
            />
          </div>
          <div className="modal-field">
            <label className="modal-label">API 키</label>
            <input
              className="modal-input modal-input--key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-…"
              type="password"
              disabled={saving}
            />
          </div>
          <div className="modal-field">
            <label className="modal-label">워크스페이스 (선택)</label>
            <input
              className="modal-input"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              placeholder="팀명 또는 프로젝트명"
              disabled={saving}
            />
          </div>
          {formError && <div className="modal-error">{formError}</div>}
          <button className="modal-btn-add" type="submit" disabled={saving}>
            {saving ? "추가 중…" : "+ 추가"}
          </button>
        </form>
      </div>
    </div>
  );
}
