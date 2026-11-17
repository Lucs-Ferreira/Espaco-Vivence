'use client';

export default function Modal({
  isOpen,
  title,
  message,
  type = 'success',
  onClose,
  onConfirm,
  confirmText = 'Confirmar',
  confirmIcon = 'fa-trash-can',
  closeText = 'Entendido',
  secondaryText,
  onSecondary,
}) {
  if (!isOpen) return null;

  const isSuccess = type === 'success';
  const isConfirm = type === 'confirm';

  return (
    <div className="modal-backdrop-vivence" role="presentation">
      <section
        className="card-vivence p-4 text-center w-100"
        style={{ maxWidth: '420px' }}
        role={isConfirm ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="vivence-modal-title"
        aria-describedby="vivence-modal-message"
      >
        <div
          className={`rounded-circle d-inline-flex align-items-center justify-content-center mx-auto mb-3 ${
            isSuccess ? 'badge-vivence-success' : 'badge-vivence-error'
          }`}
          style={{ width: '56px', height: '56px' }}
        >
          <i
            className={`fa-solid ${
              isSuccess ? 'fa-check' : isConfirm ? confirmIcon : 'fa-triangle-exclamation'
            } fs-4`}
          ></i>
        </div>
        <h4 id="vivence-modal-title" className="fw-bold text-vivence-dark mb-2">{title}</h4>
        <p id="vivence-modal-message" className="text-vivence-body small mb-4">{message}</p>

        {isConfirm ? (
          <div className="d-flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-vivence-outline w-50 py-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="btn-vivence-error w-50 py-2"
            >
              <i className={`fa-solid ${confirmIcon} me-2`}></i>
              {confirmText}
            </button>
          </div>
        ) : isSuccess && secondaryText && onSecondary ? (
          <div className="d-flex flex-column flex-sm-row gap-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-vivence-outline flex-fill py-2"
            >
              {closeText}
            </button>
            <button
              type="button"
              onClick={onSecondary}
              className="btn-vivence-primary flex-fill py-2"
            >
              {secondaryText}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className={`w-100 py-2 ${isSuccess ? 'btn-vivence-primary' : 'btn-vivence-error'}`}
          >
            <i className="fa-solid fa-circle-check me-2"></i>
            {closeText}
          </button>
        )}
      </section>
    </div>
  );
}