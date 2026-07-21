import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';

export function Tooltip({
  children,
  content,
  className,
  side = 'top',
  render,
}: {
  children: ReactNode;
  content: ReactNode;
  className?: string;
  side?: 'top' | 'bottom';
  render?: ReactElement;
}) {
  if (content === null || content === undefined || content === '') return <>{children}</>;

  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger
        delay={120}
        render={
          render ?? <span className={className ? `ui-tip ${className}` : 'ui-tip'} tabIndex={0} />
        }
      >
        {children}
      </BaseTooltip.Trigger>
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner className="ui-tip-positioner" side={side} sideOffset={6}>
          <BaseTooltip.Popup className="ui-tip-popup">{content}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
