'use client';

export default function Modal({
  isOpen,
  title,
  message,
  type = 'success',
  onClose,
  onConfirm,
  confirmText = 'Confirmar',
}) {
  if (!isOpen) return null;

  const isSuccess = type === 'success';
  const isConfirm = type === 'confirm';

  return (
    <div className="modal-backdrop-vivence">
      <div className="card-vivence p-4 text-center w-100" style={{ maxWidth: '420px' }}>
        <div
          className={`rounded-circle d-inline-flex align-items-center justify-content-center mx-auto mb-3 ${
            isSuccess ? 'badge-vivence-success' : 'badge-vivence-error'
          }`}
          style={{ width: '56px', height: '56px' }}
        >
          <i
            className={`fa-solid ${
              isSuccess ? 'fa-check' : isConfirm ? 'fa-trash-can' : 'fa-triangle-exclamation'
            } fs-4`}
          ></i>
        </div>
        <h4 className="fw-bold text-vivence-dark mb-2">{title}</h4>
        <p className="text-vivence-body small mb-4">{message}</p>

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
              <i className="fa-solid fa-trash me-2"></i>
              {confirmText}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className={`w-100 py-2 ${isSuccess ? 'btn-vivence-primary' : 'btn-vivence-error'}`}
          >
            <i className="fa-solid fa-circle-check me-2"></i>
            Entendido
          </button>
        )}
      </div>
    </div>
  );
}