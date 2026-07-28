import { useState } from 'react';

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
    <div className="trainer-note">
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
        <div className="trainer-note-pop">
          <input
            autoFocus
            className="input"
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
