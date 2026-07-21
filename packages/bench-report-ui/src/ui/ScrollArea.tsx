import { ScrollArea as BaseScrollArea } from '@base-ui/react/scroll-area';
import type { ReactNode } from 'react';

export function ScrollArea({
  children,
  className,
  orientation = 'vertical',
}: {
  children: ReactNode;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
}) {
  return (
    <BaseScrollArea.Root
      className={className ? `ui-scroll ${className}` : 'ui-scroll'}
      data-orientation={orientation}
    >
      <BaseScrollArea.Viewport className="ui-scroll-viewport">
        <BaseScrollArea.Content
          className="ui-scroll-content"
          style={orientation === 'vertical' ? { minWidth: 0, width: '100%' } : undefined}
        >
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar orientation={orientation} className="ui-scroll-bar">
        <BaseScrollArea.Thumb className="ui-scroll-thumb" />
      </BaseScrollArea.Scrollbar>
    </BaseScrollArea.Root>
  );
}
