import { Send, Square } from "lucide-react";
import type { InputHTMLAttributes, KeyboardEvent } from "react";
import { Button, Input } from "../../../ui";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  aborting: boolean;
  disabled?: boolean;
  allowInputWhileBusy?: boolean;
  placeholder: string;
  onSubmit: (value: string) => void;
  onAbort: () => void;
  hint?: string | null;
  inputProps?: Pick<
    InputHTMLAttributes<HTMLInputElement>,
    "autoFocus" | "onFocus" | "onKeyUp" | "onClick" | "onSelect"
  >;
  onValueDetail?: (value: string, selectionStart: number | null) => void;
  onKeyDownIntercept?: (event: KeyboardEvent<HTMLInputElement>) => boolean;
}

export function ChatComposer({
  value,
  onChange,
  busy,
  aborting,
  disabled,
  allowInputWhileBusy = false,
  placeholder,
  onSubmit,
  onAbort,
  hint,
  inputProps,
  onValueDetail,
  onKeyDownIntercept,
}: ChatComposerProps) {
  return (
    <>
      <div className="chat-composer">
        <Input
          className="chat-composer-field"
          placeholder={placeholder}
          value={value}
          disabled={(busy && !allowInputWhileBusy) || disabled}
          onChange={(e) => {
            onChange(e.target.value);
            onValueDetail?.(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (onKeyDownIntercept?.(e)) return;
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
