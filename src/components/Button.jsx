import './Button.css';

export default function Button({
  variant = 'primary',
  type = 'button',
  loading = false,
  disabled = false,
  fullWidth = false,
  onClick,
  children,
  ...rest
}) {
  const classes = [
    'btn',
    `btn--${variant}`,
    fullWidth ? 'btn--full' : '',
    loading ? 'is-loading' : ''
  ].filter(Boolean).join(' ');

  return (
    <button
      type={type}
      className={classes}
      onClick={onClick}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <span className="btn__label">{children}</span>
      {loading && <span className="btn__spinner" aria-hidden="true" />}
    </button>
  );
}
