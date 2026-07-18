import type { AnchorHTMLAttributes, HTMLAttributes } from "react";

type CardProps = {
  link?: boolean;
} & AnchorHTMLAttributes<HTMLAnchorElement>;

export function Card({ link, href, className, children, ...rest }: CardProps) {
  const cls = `card${link || href ? " card--link" : ""}${className ? ` ${className}` : ""}`;

  if (link || href) {
    return (
      <a className={cls} href={href} {...rest}>
        {children}
      </a>
    );
  }

  return (
    <div className={cls} {...(rest as HTMLAttributes<HTMLDivElement>)}>
      {children}
    </div>
  );
}
