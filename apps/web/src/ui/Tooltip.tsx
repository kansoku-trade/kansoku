import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactNode } from "react";

type TooltipPlacement = "top" | "bottom";

interface TooltipProps {
  children: ReactNode;
  className?: string;
  content: ReactNode;
  disabled?: boolean;
  focusable?: boolean;
  placement?: TooltipPlacement;
}

function hasContent(content: ReactNode): boolean {
  return content !== null && content !== undefined && content !== false && content !== "";
}

export function Tooltip({
  children,
  className,
  content,
  disabled,
  focusable = false,
  placement = "top",
}: TooltipProps) {
  if (disabled || !hasContent(content)) return <>{children}</>;

  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger
        delay={100}
        render={
          <span
            className={`tooltip-anchor${className ? ` ${className}` : ""}`}
            tabIndex={focusable ? 0 : undefined}
          />
        }
      >
        {children}
      </BaseTooltip.Trigger>
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner className="tooltip-positioner" side={placement} sideOffset={8}>
          <BaseTooltip.Popup className="tooltip-panel">{content}</BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
