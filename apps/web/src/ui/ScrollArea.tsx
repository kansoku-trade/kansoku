import { ScrollArea as BaseScrollArea } from "@base-ui/react/scroll-area";
import type { Ref, UIEvent, ReactNode } from "react";

type Orientation = "vertical" | "horizontal";

export function ScrollArea({
  children,
  className,
  viewportClassName,
  contentClassName,
  orientation = "vertical",
  viewportRef,
  onScroll,
}: {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  contentClassName?: string;
  orientation?: Orientation;
  viewportRef?: Ref<HTMLDivElement>;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
}) {
  return (
    <BaseScrollArea.Root
      className={`scroll-area${className ? ` ${className}` : ""}`}
      data-orientation={orientation}
    >
      <BaseScrollArea.Viewport
        ref={viewportRef}
        onScroll={onScroll}
        className={`scroll-area-viewport${viewportClassName ? ` ${viewportClassName}` : ""}`}
      >
        <BaseScrollArea.Content
          style={orientation === "vertical" ? { minWidth: 0, width: "100%" } : undefined}
          className={`scroll-area-content${contentClassName ? ` ${contentClassName}` : ""}`}
        >
          {children}
        </BaseScrollArea.Content>
      </BaseScrollArea.Viewport>
      <BaseScrollArea.Scrollbar orientation={orientation} className="scroll-area-scrollbar">
        <BaseScrollArea.Thumb className="scroll-area-thumb" />
      </BaseScrollArea.Scrollbar>
    </BaseScrollArea.Root>
  );
}
