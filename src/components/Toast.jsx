import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import './Toast.css';

const ToastCtx = createContext(null);

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => {
    setToasts((arr) => arr.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((message, options = {}) => {
    const id = nextId.current++;
    const toast = {
      id,
      message,
      variant: options.variant || 'success',
      duration: options.duration ?? 3000
    };
    setToasts((arr) => [...arr, toast]);
    return id;
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => dismiss(t.id), t.duration)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  return (
    <ToastCtx.Provider value={{ show, dismiss }}>
      {children}
      <div className="toast-stack" role="region" aria-live="polite" aria-label="Notificações">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.variant}`}>
            <span className="toast__msg">{t.message}</span>
            <button
              type="button"
              className="toast__close"
              onClick={() => dismiss(t.id)}
              aria-label="Dispensar notificação"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
