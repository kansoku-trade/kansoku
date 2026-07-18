import type { MentionCandidate } from "./atMention.js";

export function AtMentionPopover({
  candidates,
  activeIndex,
  onPick,
}: {
  candidates: MentionCandidate[];
  activeIndex: number;
  onPick: (candidate: MentionCandidate) => void;
}) {
  if (candidates.length === 0) {
    return (
      <div className="assistant-mention-popover">
        <div className="assistant-mention-empty">没有匹配的文件</div>
      </div>
    );
  }

  return (
    <div className="assistant-mention-popover" role="listbox" aria-label="研究资料">
      {candidates.map((candidate, index) => (
        <button
          type="button"
          key={candidate.path}
          role="option"
          aria-selected={index === activeIndex}
          className={`assistant-mention-item${index === activeIndex ? " active" : ""}`}
          onMouseDown={(event) => {
            event.preventDefault();
            onPick(candidate);
          }}
        >
          <span className="assistant-mention-title">{candidate.title}</span>
          <span className="assistant-mention-path">{candidate.path}</span>
        </button>
      ))}
    </div>
  );
}
