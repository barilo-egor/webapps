import { useEffect } from 'react';

/* ---------- Модальное окно ---------- */
export function Modal({ icon, title, onClose, busy, children, foot }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <span className="modal-icon">
            <i className={icon} />
          </span>
          <h2>{title}</h2>
          <button
            type="button"
            className="modal-x"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть"
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

/* ---------- Модалка подтверждения ---------- */
export function ConfirmModal({ title, message, confirmLabel, danger, busy, onConfirm, onClose }) {
  return (
    <Modal
      icon={danger ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-question'}
      title={title}
      busy={busy}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Выполнение…' : confirmLabel}
          </button>
        </>
      }
    >
      <div>{message}</div>
    </Modal>
  );
}
