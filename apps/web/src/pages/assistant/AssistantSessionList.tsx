import { Plus, X } from "lucide-react";
import type { AssistantSessionMeta } from "@kansoku/core/contract/index";
import { Button, Empty, Spinner, TimeAgo, openModal } from "@web/ui";

interface AssistantSessionListProps {
  sessions: AssistantSessionMeta[];
  activeId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

function confirmDelete(session: AssistantSessionMeta, onDelete: (id: string) => void): void {
  openModal({
    title: "删除会话",
    body: (close) => (
      <div className="assistant-confirm">
        <p>删除「{session.title}」后无法恢复，确定继续吗？</p>
        <div className="assistant-confirm-actions">
          <Button onClick={close}>取消</Button>
          <Button
            accent
            onClick={() => {
              onDelete(session.id);
              close();
            }}
          >
            确认删除
          </Button>
        </div>
      </div>
    ),
  });
}

export function AssistantSessionList({ sessions, activeId, loading, error, onSelect, onCreate, onDelete }: AssistantSessionListProps) {
  return (
    <div className="assistant-sidebar">
      <div className="assistant-sidebar-head">
        <Button className="assistant-new-session" onClick={onCreate}>
          <Plus size={13} /> 新建会话
        </Button>
      </div>
      <div className="assistant-sidebar-scroll">
        {loading && sessions.length === 0 ? (
          <div className="assistant-sidebar-state">
            <Spinner /> 正在读取会话…
          </div>
        ) : error ? (
          <div className="assistant-sidebar-state">{error}</div>
        ) : sessions.length === 0 ? (
          <Empty className="assistant-sidebar-empty">还没有会话</Empty>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`assistant-session-row${session.id === activeId ? " active" : ""}`}
              onClick={() => onSelect(session.id)}
            >
              <div className="assistant-session-row-main">
                <span className="assistant-session-title">{session.title}</span>
                <span className="assistant-session-time">
                  <TimeAgo since={session.updatedAt} />
                </span>
              </div>
              <button
                type="button"
                className="assistant-session-delete"
                aria-label="删除会话"
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(session, onDelete);
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
