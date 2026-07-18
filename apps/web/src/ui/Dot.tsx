import type { HTMLAttributes } from "react";

type DotProps = {
  tone?: "accent" | "ok" | "up" | "down";
  pulse?: boolean;
} & HTMLAttributes<HTMLSpanElement>;

export function Dot({ tone, pulse, className, ...rest }: DotProps) {
  const cls = `dot${tone ? ` dot--${tone}` : ""}${pulse ? " dot--pulse" : ""}${className ? ` ${className}` : ""}`;

  return <span className={cls} {...rest} />;
}
