import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import styles from './ConfirmDialog.module.css';

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

/**
 * Promise-based replacement for window.confirm rendered as a themed modal.
 * Usage: const confirm = useConfirm();
 *        if (!(await confirm({ message: '…', danger: true }))) return;
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );

  function settle(value: boolean) {
    pending?.resolve(value);
    setPending(null);
  }

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        settle(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pending]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <div
          className={styles.overlay}
          role="presentation"
        >
          <div
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
          >
            <h3 id="confirm-dialog-title" className={styles.title}>
              {pending.title || 'Are you sure?'}
            </h3>
            <p id="confirm-dialog-message" className={styles.message}>{pending.message}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={() => settle(false)}
                autoFocus
              >
                {pending.cancelLabel || 'Cancel'}
              </button>
              <button
                type="button"
                className={pending.danger ? styles.dangerButton : styles.confirmButton}
                onClick={() => settle(true)}
              >
                {pending.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}
