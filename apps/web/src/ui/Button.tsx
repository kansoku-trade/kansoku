import type { ButtonHTMLAttributes } from "react";

type ButtonProps = {
  accent?: boolean;
  state?: "busy" | "done" | "failed";
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ accent, state, className, children, ...rest }: ButtonProps) {
  const cls = `btn${accent ? " btn--accent" : ""}${state ? ` btn--${state}` : ""}${className ? ` ${className}` : ""}`;

  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
