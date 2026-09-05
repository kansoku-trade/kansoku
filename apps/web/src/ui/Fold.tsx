import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { clsx } from 'clsx';
import { ChevronRight } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import * as stylex from '@stylexjs/stylex';
import { colors } from '../theme/tokens.stylex';

const foldTransition = { duration: 0.2, ease: [0.2, 0.9, 0.3, 1] } as const;

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    minWidth: 0,
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    textAlign: 'left',
  },
  triggerFit: {
    display: 'inline-flex',
    width: 'auto',
    alignSelf: 'flex-start',
  },
  caret: {
    'flex': 'none',
    'alignSelf': 'center',
    'marginLeft': 'auto',
    'color': colors.textMuted,
    'transition': 'transform 0.12s ease',
    '@media (prefers-reduced-motion: reduce)': {
      transition: 'none',
    },
  },
  caretOpen: {
    transform: 'rotate(90deg)',
  },
  caretFit: {
    marginLeft: 0,
  },
  panel: {
    width: '100%',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
});

interface FoldStateValue {
  open: boolean;
}

interface FoldActionsValue {
  onToggle: () => void;
}

const FoldStateContext = createContext<FoldStateValue | null>(null);
const FoldActionsContext = createContext<FoldActionsValue | null>(null);

export function useFoldState(): FoldStateValue {
  const value = useContext(FoldStateContext);
  if (!value) throw new Error('useFoldState must be used inside Fold');
  return value;
}

export function useFoldActions(): FoldActionsValue {
  const value = useContext(FoldActionsContext);
  if (!value) throw new Error('useFoldActions must be used inside Fold');
  return value;
}

function FoldRoot({
  open,
  onToggle,
  className,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
  children: ReactNode;
}) {
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const actions = useMemo<FoldActionsValue>(
    () => ({
      onToggle: () => {
        onToggleRef.current();
      },
    }),
    [],
  );
  const state = useMemo<FoldStateValue>(() => ({ open }), [open]);

  return (
    <FoldActionsContext.Provider value={actions}>
      <FoldStateContext.Provider value={state}>
        <div
          className={clsx('ui-fold', stylex.props(styles.root).className, className)}
          data-open={open}
        >
          {children}
        </div>
      </FoldStateContext.Provider>
    </FoldActionsContext.Provider>
  );
}

function FoldTrigger({
  caret = true,
  fit = false,
  className,
  children,
  disabled,
  onClick,
  ...rest
}: {
  caret?: boolean;
  fit?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { open } = useFoldState();
  const { onToggle } = useFoldActions();
  return (
    <button
      {...rest}
      type="button"
      className={clsx(
        'ui-fold-trigger',
        stylex.props(styles.trigger, fit && styles.triggerFit).className,
        className,
      )}
      aria-expanded={open}
      disabled={disabled}
      data-open={open}
      data-fit={fit || undefined}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !disabled) onToggle();
      }}
    >
      {children}
      {caret ? (
        <ChevronRight
          size={12}
          aria-hidden="true"
          className={clsx(
            'ui-fold-caret',
            open && 'open',
            stylex.props(styles.caret, fit && styles.caretFit, open && styles.caretOpen).className,
          )}
        />
      ) : null}
    </button>
  );
}

function FoldPanel({ className, children }: { className?: string; children: ReactNode }) {
  const { open } = useFoldState();
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className={clsx('ui-fold-panel', stylex.props(styles.panel).className)}
          initial={{ height: 0 }}
          animate={{ height: 'auto' }}
          exit={{ height: 0 }}
          transition={foldTransition}
        >
          <div className={className}>{children}</div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

export const Fold = Object.assign(FoldRoot, {
  Trigger: FoldTrigger,
  Panel: FoldPanel,
});
