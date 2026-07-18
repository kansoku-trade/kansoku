import type { HTMLAttributes } from "react";

export function ErrorBox({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`error-box${className ? ` ${className}` : ""}`} {...rest}>
      {children}
    </div>
  );
}
