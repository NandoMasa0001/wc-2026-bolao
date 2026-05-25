import './Pill.css';

/**
 * Pill / Badge component.
 *
 * Variants:
 *  - live      red bg, white text, pulse
 *  - locked    stone bg, white text
 *  - points    gold bg, ink text (e.g. "+5")
 *  - group     group's colour (uses --grp-X)
 *  - neutral   subtle outline
 *  - success   lime
 *  - warning   orange
 */
export default function Pill({
  variant = 'neutral',
  group,
  children,
  className = '',
  ...rest
}) {
  const style = group ? { '--pill-bg': `var(--grp-${group})` } : undefined;
  const classes = [
    'pill',
    `pill--${variant}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} style={style} {...rest}>
      {children}
    </span>
  );
}
