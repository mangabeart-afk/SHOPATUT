'use client'

import { useId } from 'react'
import ModalPortal from './modal-portal'

type Props = {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** Site-owned confirmation dialog, always rendered in the current viewport. */
export default function ViewportConfirmDialog({
  title,
  message,
  confirmLabel = 'Conferma',
  cancelLabel = 'Annulla',
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const titleId = useId()
  return (
    <ModalPortal>
      <div className="site-modal-overlay site-confirm-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel() }}>
        <section className="site-modal-card site-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
          <div className="section-heading">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="modal-close" onClick={onCancel} aria-label="Chiudi conferma">×</button>
          </div>
          <p className="site-confirm-message">{message}</p>
          <div className="modal-actions">
            <button type="button" className="back-button" onClick={onCancel}>{cancelLabel}</button>
            <button type="button" className={destructive ? 'danger-button' : 'primary-button'} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </section>
      </div>
    </ModalPortal>
  )
}
