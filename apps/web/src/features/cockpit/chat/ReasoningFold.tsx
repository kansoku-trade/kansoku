import { Markdown } from '../markdown';
import { StepRow } from './StepRow.js';
import { reasoningGist } from './presentTranscript.js';

export function ReasoningFold({
  foldId,
  text,
  streaming,
}: {
  foldId: string;
  text: string;
  streaming?: boolean;
}) {
  if (!text) return null;

  return (
    <StepRow
      foldId={foldId}
      className="chat-reasoning"
      title="思考"
      gist={reasoningGist(text)}
      running={streaming}
      defaultOpen={streaming}
      detail={
        <Markdown variant="chat" muted>
          {text}
        </Markdown>
      }
    />
  );
}
