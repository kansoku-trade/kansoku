import type { InputHTMLAttributes } from "react";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input${className ? ` ${className}` : ""}`} {...rest} />;
}
