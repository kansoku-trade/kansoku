import type { HTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';
import { fmt } from '../lib/format';
import { colors, fonts } from '../theme/tokens.stylex';

const styles = stylex.create({
  num: {
    fontFamily: fonts.mono,
    fontVariantNumeric: 'tabular-nums',
  },
  up: {
    color: colors.up,
  },
  down: {
    color: colors.down,
  },
});

type NumProps = {
  value: number;
  diff?: boolean;
  digits?: number;
  suffix?: string;
} & HTMLAttributes<HTMLSpanElement>;

export function Num({ value, diff, digits = 2, suffix, className, ...rest }: NumProps) {
  const tone = diff ? (value >= 0 ? ' up' : ' down') : '';
  const sign = diff && value >= 0 ? '+' : '';
  const styleClassName = stylex.props(
    styles.num,
    diff && (value >= 0 ? styles.up : styles.down),
  ).className;
  const cls = `${styleClassName} num${tone}${className ? ` ${className}` : ''}`;

  return (
    <span className={cls} {...rest}>
      {sign}
      {fmt(value, digits)}
      {suffix}
    </span>
  );
}
