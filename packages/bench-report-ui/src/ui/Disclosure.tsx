import { Collapsible } from '@base-ui/react/collapsible';
import { useState, type ReactNode } from 'react';
import { ChevronDown } from './icons';

export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  className,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  return (
    <Collapsible.Root
      defaultOpen={defaultOpen}
      className={className ? `ui-disclosure ${className}` : 'ui-disclosure'}
    >
      <Collapsible.Trigger className="ui-disclosure-trigger">
        {summary}
        <span className="ui-disclosure-chevron">
          <ChevronDown />
        </span>
      </Collapsible.Trigger>
      <Collapsible.Panel className="ui-disclosure-panel">{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
}

const CLAMP_THRESHOLD = 80;

export function MoreText({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const classes = className ? `ui-moretext ${className}` : 'ui-moretext';

  if (text.length <= CLAMP_THRESHOLD) {
    return <p className={classes}>{text}</p>;
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen} className={classes}>
      {open ? null : <p className="ui-moretext-clamp">{text}</p>}
      <Collapsible.Panel className="ui-moretext-panel">
        <p>{text}</p>
      </Collapsible.Panel>
      <Collapsible.Trigger className="ui-moretext-toggle">
        {open ? '收起' : '展开'}
      </Collapsible.Trigger>
    </Collapsible.Root>
  );
}
