import * as stylex from '@stylexjs/stylex';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUp, Square } from 'lucide-react';
import type {
  FocusEventHandler,
  KeyboardEvent,
  KeyboardEventHandler,
  MouseEventHandler,
  ReactEventHandler,
  Ref,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, Input } from '@web/ui';
import { colors, fontSizes, radii, shadows, sizes } from '../../../theme/tokens.stylex';

const styles = stylex.create({
  composer: {
    alignItems: 'center',
    display: 'flex',
    flex: '0 0 auto',
  },
  contents: {
    display: 'contents',
  },
  field: {
    flex: '1 1 auto',
    minWidth: 0,
  },
  action: {
    'alignItems': 'center',
    'backgroundColor': colors.accent,
    'borderColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': '#000',
    'display': 'inline-flex',
    'flex': '0 0 auto',
    'height': sizes.controlHeight,
    'justifyContent': 'center',
    'padding': 0,
    'transitionDuration': '150ms',
    'transitionProperty': 'scale, background-color, color',
    'transitionTimingFunction': 'ease-out',
    'width': sizes.controlHeight,
    ':disabled': {
      backgroundColor: colors.backgroundHover,
      color: colors.textMuted,
    },
    ':active:not([disabled])': {
      scale: 0.96,
    },
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0.01ms',
    },
  },
  actionStop: {
    backgroundColor: colors.down,
    color: colors.textBright,
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

const shell = stylex.create({
  root: {
    'backgroundColor': colors.backgroundElement,
    'borderColor': colors.borderStrong,
    'borderRadius': radii.composer,
    'borderStyle': 'solid',
    'borderWidth': '1px',
    'boxShadow': shadows.composer,
    'gap': '8px',
    'overflow': 'hidden',
    'padding': '6px 8px 6px 12px',
    'transitionDuration': '120ms',
    'transitionProperty': 'border-color, box-shadow',
    'transitionTimingFunction': 'ease',
    ':focus-within': {
      borderColor: colors.focusBorder,
      boxShadow: shadows.composerFocus,
    },
  },
});

const bareField = stylex.create({
  root: {
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
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
  disabled?: boolean;
  allowInputWhileBusy?: boolean;
  multiline?: boolean;
  textareaRef?: Ref<HTMLTextAreaElement>;
  placeholder: string;
  onSubmit: (value: string) => void;
  onAbort: () => void;
  hint?: string | null;
  className?: string;
  layoutClassName?: string;
  fieldClassName?: string;
  hintClassName?: string;
  actionClassName?: string;
  actionIconClassName?: string;
  actionSlot?: HTMLElement | null;
  inputProps?: ChatComposerFieldProps;
  onValueDetail?: (value: string, selectionStart: number | null) => void;
  onKeyDownIntercept?: (event: KeyboardEvent<ChatComposerFieldElement>) => boolean;
}

export function ChatComposer({
  value,
  onChange,
  busy,
  aborting,
  disabled,
  allowInputWhileBusy = false,
  multiline = false,
  textareaRef,
  placeholder,
  onSubmit,
  onAbort,
  hint,
  className,
  layoutClassName,
  fieldClassName,
  hintClassName,
  actionClassName,
  actionIconClassName,
  actionSlot,
  inputProps,
  onValueDetail,
  onKeyDownIntercept,
}: ChatComposerProps) {
  const prefersReducedMotion = useReducedMotion();
  const fieldDisabled = (busy && !allowInputWhileBusy) || disabled;
  const actionDisabled = busy ? aborting : !value.trim() || disabled;
  const sendIcon = busy ? (
    <Square size={12} fill="currentColor" aria-hidden="true" />
  ) : (
    <ArrowUp size={16} strokeWidth={2.25} aria-hidden="true" />
  );
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

  const action = (
    <Button
      className={`chat-composer-action chat-composer-action--${busy ? 'stop' : 'send'} ${stylex.props(styles.action, busy && styles.actionStop).className}${actionClassName ? ` ${actionClassName}` : ''}`}
      style={{
        backgroundColor: busy
          ? colors.down
          : actionDisabled
            ? colors.backgroundHover
            : colors.accent,
        borderColor: 'transparent',
        borderRadius: 999,
        borderStyle: 'none',
        color: busy ? colors.textBright : actionDisabled ? colors.textMuted : '#000',
        flexShrink: 0,
      }}
      aria-label={busy ? '停止生成' : '发送'}
      disabled={actionDisabled}
      onClick={busy ? onAbort : () => onSubmit(value)}
    >
      {prefersReducedMotion ? (
        <span
          className={`chat-composer-action-icon ${stylex.props(styles.actionIcon).className}${actionIconClassName ? ` ${actionIconClassName}` : ''}`}
        >
          {sendIcon}
        </span>
      ) : (
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span
            key={busy ? 'stop' : 'send'}
            className={`chat-composer-action-icon ${stylex.props(styles.actionIcon).className}${actionIconClassName ? ` ${actionIconClassName}` : ''}`}
            initial={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.25, filter: 'blur(4px)' }}
            transition={{ type: 'spring', duration: 0.3, bounce: 0 }}
          >
            {sendIcon}
          </motion.span>
        </AnimatePresence>
      )}
    </Button>
  );

  return (
    <>
      <div
        className={`chat-composer ${stylex.props(styles.composer, Boolean(layoutClassName) && styles.contents, !layoutClassName && shell.root).className}${className ? ` ${className}` : ''}${layoutClassName ? ` ${layoutClassName}` : ''}`}
      >
        {multiline ? (
          <textarea
            ref={textareaRef}
            className={`input chat-composer-field chat-composer-field--multiline ${stylex.props(styles.field, bareField.root).className}${fieldClassName ? ` ${fieldClassName}` : ''}`}
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
            className={`chat-composer-field ${stylex.props(styles.field, bareField.root).className}${fieldClassName ? ` ${fieldClassName}` : ''}`}
            style={{
              backgroundColor: 'transparent',
              borderRadius: 0,
              borderStyle: 'none',
              borderWidth: 0,
              boxShadow: 'none',
            }}
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
        {actionSlot === undefined ? action : null}
      </div>
      {actionSlot ? createPortal(action, actionSlot) : null}
      {hint && (
        <div
          className={`chat-hint ${stylex.props(styles.hint).className}${hintClassName ? ` ${hintClassName}` : ''}`}
          role="alert"
        >
          {hint}
        </div>
      )}
    </>
  );
}
