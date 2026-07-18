import type { HTMLAttributes } from "react";

export function SectionTitle({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`section-title${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </div>
  );
}
