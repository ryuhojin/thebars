import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

type AdaptiveDialogProps = {
  title: string;
  open: boolean;
  children: ReactNode;
  onClose: () => void;
  panelClassName?: string;
};

export function AdaptiveDialog({ title, open, children, onClose, panelClassName }: AdaptiveDialogProps) {
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = focusableElements(dialogRef.current);
    (focusables[0] ?? dialogRef.current)?.focus();
    return () => {
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = focusableElements(dialogRef.current);
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className={panelClassName ? `adaptive-dialog ${panelClassName}` : "adaptive-dialog"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="adaptive-dialog-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header>
          <h2 id="adaptive-dialog-title">{title}</h2>
          <button className="icon-button" type="button" aria-label="닫기" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function focusableElements(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => element.offsetParent !== null);
}
