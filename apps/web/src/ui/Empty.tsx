import type { HTMLAttributes } from "react";

export function Empty({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`empty${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </div>
  );
}
