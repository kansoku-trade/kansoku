import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

type ChipProps = {
  active?: boolean;
} & AnchorHTMLAttributes<HTMLAnchorElement> &
  ButtonHTMLAttributes<HTMLButtonElement>;

export function Chip({ active, href, className, children, ...rest }: ChipProps) {
  const cls = `chip${active ? " active" : ""}${className ? ` ${className}` : ""}`;

  if (href) {
    return (
      <a className={cls} href={href} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }

  return (
    <button className={cls} {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}>
      {children}
    </button>
  );
}
