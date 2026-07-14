import { Send, Square } from "lucide-react";
import type { InputHTMLAttributes } from "react";
import { Button, Input } from "../../../ui";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  aborting: boolean;
  disabled?: boolean;
  placeholder: string;
  onSubmit: (value: string) => void;
  onAbort: () => void;
  hint?: string | null;
  inputProps?: Pick<InputHTMLAttributes<HTMLInputElement>, "autoFocus" | "onFocus">;
}

export function ChatComposer({
  value,
  onChange,
  busy,
  aborting,
  disabled,
  placeholder,
  onSubmit,
  onAbort,
  hint,
  inputProps,
}: ChatComposerProps) {
  return (
    <>
      <div className="chat-composer">
        <Input
          className="chat-composer-field"
          placeholder={placeholder}
          value={value}
          disabled={busy || disabled}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            onSubmit(value);
          }}
          {...inputProps}
        />
        {busy ? (
          <Button aria-label="停止生成" disabled={aborting} onClick={onAbort}>
            <Square size={12} />
          </Button>
        ) : (
          <Button accent aria-label="发送" disabled={!value.trim() || disabled} onClick={() => onSubmit(value)}>
            <Send size={14} />
          </Button>
        )}
      </div>
      {hint && (
        <div className="chat-hint" role="alert">
          {hint}
        </div>
      )}
    </>
  );
}
