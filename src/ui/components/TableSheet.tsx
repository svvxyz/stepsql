import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: (closeButton: ReactNode) => ReactNode;
}

/**
 * Wide panel that slides in over the stage. It is a modal <dialog>: focus stays
 * inside, Esc closes it, and a click on the dimmed area outside closes it too.
 * The page behind is not unmounted, so the current step is kept.
 */
export function TableSheet({ open, onClose, labelledBy, children }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const closeButton = (
    <button type="button" className="icon-btn close-btn" onClick={onClose} aria-label={t('sheet.close')} title={t('sheet.close')}>
      ✕
    </button>
  );

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={labelledBy}
      // Only report closes the browser made on its own; when we close it, a late `close`
      // event must not shut a sheet that was reopened in the meantime.
      onClose={() => {
        if (open && !ref.current?.open) onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // The dialog box fills the panel; a click whose target is the dialog itself landed on the backdrop.
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && <div className="sheet-inner">{children(closeButton)}</div>}
    </dialog>
  );
}
