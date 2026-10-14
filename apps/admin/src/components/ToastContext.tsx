import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faCheck, faTriangleExclamation, faCircleInfo, faXmark } from '@fortawesome/free-solid-svg-icons';
import styles from './ToastContext.module.css';

type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  /** Inline action button, e.g. { label: 'Undo', onClick: restore } */
  action?: { label: string; onClick: () => void };
  duration?: number;
}

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  leaving: boolean;
  action?: ToastOptions['action'];
}

interface ToastApi {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastApi>({
  success: () => {},
  error: () => {},
  info: () => {},
});

const AUTO_DISMISS: Record<ToastVariant, number> = {
  success: 3500,
  info: 4000,
  error: 6000, // errors linger a little longer
};

const ICON: Record<ToastVariant, IconDefinition> = {
  success: faCheck,
  error: faTriangleExclamation,
  info: faCircleInfo,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback((id: number) => {
    // Trigger the exit animation, then unmount.
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => remove(id), 220);
  }, [remove]);

  const push = useCallback((message: string, variant: ToastVariant, options?: ToastOptions) => {
    if (!message) return;
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, variant, leaving: false, action: options?.action }]);
    // Toasts carrying an action stay up longer so there is time to use it.
    const duration = options?.duration ?? (options?.action ? 7000 : AUTO_DISMISS[variant]);
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (m: string, o?: ToastOptions) => push(m, 'success', o),
    error: (m: string, o?: ToastOptions) => push(m, 'error', o),
    info: (m: string, o?: ToastOptions) => push(m, 'info', o),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.viewport} aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`${styles.toast} ${styles[t.variant]} ${t.leaving ? styles.leaving : ''}`}
            role={t.variant === 'error' ? 'alert' : 'status'}
          >
            <span className={styles.icon} aria-hidden="true"><FontAwesomeIcon icon={ICON[t.variant]} /></span>
            <span className={styles.message}>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className={styles.close} onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <FontAwesomeIcon icon={faXmark} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
