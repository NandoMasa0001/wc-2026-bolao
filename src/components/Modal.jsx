import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Modal.css';

/**
 * Modal / Sheet. On mobile (≤640px) it slides up from the bottom; on desktop
 * it's a centred dialog. Dismissed by backdrop click or Escape. Focus is
 * trapped within the dialog while open.
 */
export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  labelledBy
}) {
  const dialogRef = useRef(null);
  const lastFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement;
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll(
          'a[href], button:not(:disabled), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    // initial focus — prefer the first interactive element that isn't the close button.
    const t = setTimeout(() => {
      const focusables = dialogRef.current?.querySelectorAll(
        'a[href], button:not(:disabled), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables || focusables.length === 0) return;
      const target = Array.from(focusables).find(
        (el) => !el.classList.contains('modal__close')
      ) || focusables[0];
      target.focus();
    }, 10);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      clearTimeout(t);
      document.body.style.overflow = '';
      lastFocusedRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="modal" role="presentation">
      <div
        className="modal__backdrop"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={dialogRef}
        className="modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || 'modal-title'}
      >
        <header className="modal__header">
          <h2 id={labelledBy || 'modal-title'} className="modal__title">{title}</h2>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Fechar"
          >
            ×
          </button>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}
