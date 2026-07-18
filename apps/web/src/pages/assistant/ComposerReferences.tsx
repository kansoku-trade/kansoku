import { AtSign, X } from "lucide-react";
import type { MentionCandidate } from "./atMention.js";

export function ComposerReferences({
  references,
  onRemove,
}: {
  references: MentionCandidate[];
  onRemove: (path: string) => void;
}) {
  if (references.length === 0) return null;

  return (
    <div className="assistant-composer-references" aria-label="已引用的研究资料">
      {references.map((reference) => (
        <span className="assistant-composer-reference" key={reference.path}>
          <AtSign size={12} aria-hidden="true" />
          <span className="assistant-composer-reference-title">{reference.title}</span>
          <span className="assistant-composer-reference-path">{reference.path}</span>
          <button type="button" aria-label={`移除 ${reference.title}`} onClick={() => onRemove(reference.path)}>
            <X size={11} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}
