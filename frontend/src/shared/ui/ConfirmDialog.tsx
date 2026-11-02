import { useEffect, useId, useRef, useState } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Built on the native dialog, which provides the focus trap and Escape handling. */
export function ConfirmDialog(props: ConfirmDialogProps) {
  const { title, message, confirmLabel, cancelLabel, onConfirm, onCancel } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Captured while rendering, because by the time effects run, autoFocus has already moved focus.
  const [opener] = useState(() => document.activeElement);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
      // The browser restores focus itself only when a dialog closes in place. React removes this
      // one from the page, so focus would fall to the body, losing a keyboard user's position.
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, [opener]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p>{message}</p>
      <div className="dialog-actions">
        <button type="button" autoFocus onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className="button-danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
