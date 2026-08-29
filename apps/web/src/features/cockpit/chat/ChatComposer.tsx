import * as stylex from '@stylexjs/stylex';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Send, Square } from 'lucide-react';
import type {
  FocusEventHandler,
  KeyboardEvent,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactEventHandler,
  Ref,
} from 'react';
import { Button, Input } from '@web/ui';
import { colors, fontSizes, radii, sizes } from '../../../theme/tokens.stylex';

const styles = stylex.create({
  composer: {
    alignItems: 'center',
    display: 'flex',
    flex: '0 0 auto',
    gap: '8px',
    padding: '8px 12px',
  },
  dockComposer: {
    padding: '6px 6px 6px 12px',
  },
  field: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  dockField: {
    backgroundColor: 'transparent',
    borderStyle: 'none',
    borderWidth: 0,
    ':enabled': {
      backgroundColor: 'transparent',
      borderStyle: 'none',
      borderWidth: 0,
    },
    ':disabled': {
      backgroundColor: 'transparent',
      borderStyle: 'none',
      borderWidth: 0,
    },
    ':focus-visible': {
      borderColor: 'transparent',
      boxShadow: 'none',
    },
  },
  action: {
    'alignItems': 'center',
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'height': sizes.controlHeight,
    'justifyContent': 'center',
    'padding': 0,
    'transitionDuration': '150ms',
    'transitionProperty': 'scale, border-color, background-color',
    'transitionTimingFunction': 'ease-out',
    'width': sizes.controlHeight,
    ':active:not([disabled])': {
      scale: 0.96,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01ms',
    },
  },
  dockAction: {
    borderRadius: radii.full,
  },
  actionIcon: {
    alignItems: 'center',
    display: 'inline-flex',
    justifyContent: 'center',
  },
  hint: {
    color: colors.textSecondary,
    flex: '0 0 auto',
    fontSize: fontSizes.sm,
    padding: '0 12px 8px',
  },
});

type ChatComposerFieldElement = HTMLInputElement | HTMLTextAreaElement;

interface ChatComposerFieldProps {
  autoFocus?: boolean;
  onFocus?: FocusEventHandler<ChatComposerFieldElement>;
  onBlur?: FocusEventHandler<ChatComposerFieldElement>;
  onKeyUp?: KeyboardEventHandler<ChatComposerFieldElement>;
  onClick?: MouseEventHandler<ChatComposerFieldElement>;
  onSelect?: ReactEventHandler<ChatComposerFieldElement>;
}

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  aborting: boolean;
  dock?: boolean;
  disabled?: boolean;
  allowInputWhileBusy?: boolean;
  multiline?: boolean;
  textareaRef?: Ref<HTMLTextAreaElement>;
  placeholder: string;
  onSubmit: (value: string) => void;
  onAbort: () => void;
  hint?: string | null;
  inputProps?: ChatComposerFieldProps;
  onValueDetail?: (value: string, selectionStart: number | null) => void;
  onKeyDownIntercept?: (event: KeyboardEvent<ChatComposerFieldElement>) => boolean;
}

export function ChatComposer({
  value,
  onChange,
  busy,
  aborting,
  dock = false,
  disabled,
  allowInputWhileBusy = false,
  multiline = false,
  textareaRef,
  placeholder,
  onSubmit,
  onAbort,
  hint,
  inputProps,
  onValueDetail,
  onKeyDownIntercept,
}: ChatComposerProps) {
  const prefersReducedMotion = useReducedMotion();
  const fieldDisabled = (busy && !allowInputWhileBusy) || disabled;
  const handleKeyDown = (event: KeyboardEvent<ChatComposerFieldElement>) => {
    if (onKeyDownIntercept?.(event)) return;
    if (event.key !== 'Enter' || event.nativeEvent.isComposing || (multiline && event.shiftKey))
      return;
    event.preventDefault();
    onSubmit(value);
  };

  const fieldProps = {
    autoFocus: inputProps?.autoFocus,
    onFocus: inputProps?.onFocus,
    onBlur: inputProps?.onBlur,
    onKeyUp: inputProps?.onKeyUp,
    onClick: inputProps?.onClick,
    onSelect: inputProps?.onSelect,
  };

  return (
    <>
      <div
        className={`chat-composer ${stylex.props(styles.composer, dock && styles.dockComposer).className}`}
      >
        {multiline ? (
          <textarea
            ref={textareaRef}
            className={`input chat-composer-field chat-composer-field--multiline ${stylex.props(styles.field, dock && styles.dockField).className}`}
            rows={1}
            aria-label={placeholder}
            autoComplete="off"
            name="message"
            placeholder={placeholder}
            value={value}
            disabled={fieldDisabled}
            onChange={(event) => {
              onChange(event.target.value);
              onValueDetail?.(event.target.value, event.target.selectionStart);
            }}
            onKeyDown={handleKeyDown}
            {...fieldProps}
          />
        ) : (
          <Input
            className={`chat-composer-field ${stylex.props(styles.field, dock && styles.dockField).className}`}
            aria-label={placeholder}
            autoComplete="off"
            name="message"
            placeholder={placeholder}
            value={value}
            disabled={fieldDisabled}
            onChange={(event) => {
              onChange(event.target.value);
              onValueDetail?.(event.target.value, event.target.selectionStart);
            }}
            onKeyDown={handleKeyDown}
            {...fieldProps}
          />
        )}
        <Button
          accent={!busy}
          className={`chat-composer-action chat-composer-action--${busy ? 'stop' : 'send'} ${stylex.props(styles.action, dock && styles.dockAction).className}`}
          aria-label={busy ? '停止生成' : '发送'}
          disabled={busy ? aborting : !value.trim() || disabled}
          onClick={busy ? onAbort : () => onSubmit(value)}
        >
          {prefersReducedMotion ? (
            <span
              className={`chat-composer-action-icon ${stylex.props(styles.actionIcon).className}`}
            >
              {busy ? (
                <Square size={12} aria-hidden="true" />
              ) : (
                <Send size={14} aria-hidden="true" />
              )}
            </span>
          ) : (
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={busy ? 'stop' : 'send'}
                className={`chat-composer-action-icon ${stylex.props(styles.actionIcon).className}`}
                initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
                transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
              >
                {busy ? (
                  <Square size={12} aria-hidden="true" />
                ) : (
                  <Send size={14} aria-hidden="true" />
                )}
              </motion.span>
            </AnimatePresence>
          )}
        </Button>
      </div>
      {hint && (
        <div className={`chat-hint ${stylex.props(styles.hint).className}`} role="alert">
          {hint}
        </div>
      )}
    </>
  );
}
