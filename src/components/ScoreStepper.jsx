import { useId } from 'react';
import './ScoreStepper.css';

/**
 * ScoreStepper — accessible goal counter.
 *
 * Uses a real <input type="number"> for keyboard editing and SR support,
 * with – / + buttons for touch.
 */
export default function ScoreStepper({
  value,
  onChange,
  min = 0,
  max = 20,
  disabled = false,
  ariaLabel = 'Goals',
  size = 'md'
}) {
  const inputId = useId();
  const v = value ?? 0;
  const dec = () => onChange(Math.max(min, v - 1));
  const inc = () => onChange(Math.min(max, v + 1));

  const set = (n) => {
    if (Number.isNaN(n)) return;
    onChange(Math.max(min, Math.min(max, n)));
  };

  return (
    <div
      className={`stepper stepper--${size} ${disabled ? 'is-disabled' : ''}`.trim()}
      role="group"
      aria-label={ariaLabel}
    >
      <button
        type="button"
        className="stepper__btn"
        onClick={dec}
        disabled={disabled || v <= min}
        aria-label="Decrease"
        aria-controls={inputId}
      >
        −
      </button>
      <input
        id={inputId}
        type="number"
        inputMode="numeric"
        className="stepper__input tabular"
        value={v}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => set(parseInt(e.target.value, 10))}
      />
      <button
        type="button"
        className="stepper__btn"
        onClick={inc}
        disabled={disabled || v >= max}
        aria-label="Increase"
        aria-controls={inputId}
      >
        +
      </button>
    </div>
  );
}
