import type { HTMLAttributes } from "react";

export function Spinner({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={`spinner${className ? ` ${className}` : ""}`} {...rest} />;
}
