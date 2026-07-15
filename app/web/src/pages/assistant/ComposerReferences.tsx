import { AtSign, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { MentionCandidate } from "./atMention.js";

export function ComposerReferences({
  references,
  onRemove,
}: {
  references: MentionCandidate[];
  onRemove: (path: string) => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {references.length > 0 ? (
        <motion.div
          className="assistant-composer-references"
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -8, filter: "blur(4px)", transition: { duration: 0.15, ease: "easeIn" } }}
          transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
          aria-label="已引用的研究资料"
        >
          {references.map((reference) => (
            <span className="assistant-composer-reference" key={reference.path}>
              <AtSign size={12} />
              <span className="assistant-composer-reference-title">{reference.title}</span>
              <span className="assistant-composer-reference-path">{reference.path}</span>
              <button type="button" aria-label={`移除 ${reference.title}`} onClick={() => onRemove(reference.path)}>
                <X size={11} />
              </button>
            </span>
          ))}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
