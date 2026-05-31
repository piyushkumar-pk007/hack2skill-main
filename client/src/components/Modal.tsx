import { createPortal } from "react-dom";
import { useEffect, useId, useRef, type ReactNode } from "react";

interface ModalProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, description, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialogElement = dialogRef.current;
    const focusable = dialogElement?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusable?.[0];
    const lastElement = focusable?.[focusable.length - 1];

    firstElement?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === "Tab" && focusable && focusable.length > 0) {
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.body.style.overflow = "hidden";
    dialogElement?.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      dialogElement?.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" role="presentation">
      <div
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal-card"
        ref={dialogRef}
        role="dialog"
      >
        <div className="modal-header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? (
              <p className="subtle-text" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>

          <button aria-label="Close dialog" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </div>

        {children}
      </div>
    </div>,
    document.body
  );
}
