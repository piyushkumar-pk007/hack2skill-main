import { createContext, startTransition, useContext, useEffect, useId, useState, type ReactNode } from "react";
import type { ToastItem } from "../types/api";

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const providerId = useId();

  useEffect(() => {
    if (toasts.length === 0) {
      return undefined;
    }

    const timeouts = toasts.map((toast) =>
      window.setTimeout(() => {
        setToasts((current) => current.filter((item) => item.id !== toast.id));
      }, 7_000)
    );

    return () => {
      timeouts.forEach((timeoutId) => window.clearTimeout(timeoutId));
    };
  }, [toasts]);

  const value: ToastContextValue = {
    pushToast: (toast) => {
      startTransition(() => {
        setToasts((current) => [
          ...current,
          {
            ...toast,
            id: `${providerId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          },
        ]);
      });
    },
    dismissToast: (id) => {
      setToasts((current) => current.filter((item) => item.id !== id));
    },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div aria-atomic="false" aria-live="polite" className="toast-region">
        {toasts.map((toast) => (
          <article className={`toast-card severity-${toast.severity}`} key={toast.id}>
            <div>
              <p className="toast-title">{toast.title}</p>
              <p className="toast-body">{toast.description}</p>
            </div>

            <div className="toast-actions">
              {toast.action ? (
                <button className="ghost-button" onClick={() => void toast.action?.onAction()} type="button">
                  {toast.action.label}
                </button>
              ) : null}
              <button
                aria-label="Dismiss notification"
                className="icon-button"
                onClick={() => value.dismissToast(toast.id)}
                type="button"
              >
                ×
              </button>
            </div>
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToasts() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToasts must be used within ToastProvider.");
  }

  return context;
}
