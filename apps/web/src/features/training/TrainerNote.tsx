import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { colors, radii } from '../../theme/tokens.stylex';

const styles = stylex.create({
  input: {
    width: '260px',
  },
  popover: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    borderStyle: 'solid',
    borderWidth: '1px',
    bottom: 'calc(100% + 6px)',
    boxShadow: '0 6px 20px rgb(0 0 0 / 0.45)',
    padding: '8px',
    position: 'absolute',
    right: 0,
    zIndex: 30,
  },
  root: {
    flex: '0 0 auto',
    position: 'relative',
  },
});

export interface TrainerNoteProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}

export function TrainerNote({ label, value, onChange, hint }: TrainerNoteProps) {
  const [open, setOpen] = useState(false);
  const filled = value.trim().length > 0;

  return (
    <div className={`trainer-note ${stylex.props(styles.root).className}`}>
      <button
        className="btn"
        aria-pressed={open}
        aria-label={label}
        title={filled ? value : (hint ?? '可以留空，只是留给日后复盘')}
        onClick={() => setOpen((prev) => !prev)}
      >
        {label}
        {filled ? ' ●' : ''}
      </button>
      {open && (
        <div className={`trainer-note-pop ${stylex.props(styles.popover).className}`}>
          <input
            autoFocus
            className={`input ${stylex.props(styles.input).className}`}
            type="text"
            aria-label={`${label}内容`}
            placeholder={hint ?? '可以留空，只是留给日后复盘'}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' || e.key === 'Enter') setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
