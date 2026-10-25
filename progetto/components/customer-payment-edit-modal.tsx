'use client'

import { useRef, useState } from 'react'
import ModalPortal from './modal-portal'
import ViewportConfirmDialog from './viewport-confirm-dialog'

type Props = { action: (formData: FormData) => void; deleteAction: (formData: FormData) => void; payment: any; customerId: string }

export default function CustomerPaymentEditModal({ action, deleteAction, payment, customerId }: Props) {
  const [open, setOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const deleteButtonRef = useRef<HTMLButtonElement | null>(null)

  const submitDelete = () => {
    const submitter = deleteButtonRef.current
    setConfirmDelete(false)
    if (submitter?.form) submitter.form.requestSubmit(submitter)
  }

  return <>
    <button type="button" className="table-action" onClick={() => setOpen(true)}>Modifica</button>
    {open && <ModalPortal><div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <div className="modal-card customer-payment-edit-modal" role="dialog" aria-modal="true" aria-label={`Modifica pagamento ${payment.payment_code}`} onMouseDown={(event) => event.stopPropagation()}>
        <div className="section-heading"><div><p className="eyebrow">MODIFICA PAGAMENTO</p><h2>{payment.payment_code}</h2></div><button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Chiudi">×</button></div>
        <form action={action} className="form-grid">
          <input type="hidden" name="payment_id" value={payment.id}/>
          <input type="hidden" name="customer_id" value={customerId}/>
          <label>Data<input name="payment_date" type="date" defaultValue={payment.payment_date}/></label>
          <label>Importo €<input name="amount_eur" type="number" min="0.01" step="0.01" defaultValue={Number(payment.amount_eur || 0).toFixed(2)}/></label>
          <label>Metodo<input name="payment_method" defaultValue={payment.payment_method || ''}/></label>
          <label className="form-grid-full">Note<textarea name="notes" rows={3} defaultValue={payment.notes || ''}/></label>
          <div className="modal-actions">
            <button type="button" className="back-button" onClick={() => setOpen(false)}>Annulla</button>
            <button className="primary-button" type="submit">Salva modifiche</button>
            <button ref={deleteButtonRef} type="submit" formAction={deleteAction} className="danger-button" onClick={(event) => { event.preventDefault(); setConfirmDelete(true) }}>Cancella pagamento</button>
          </div>
        </form>
      </div>
    </div></ModalPortal>}
    {confirmDelete && (
      <ViewportConfirmDialog
        title="Conferma eliminazione pagamento"
        message={`Cancellare il pagamento ${payment.payment_code || ''}? L'eventuale assegnazione verrà annullata.`}
        confirmLabel="Cancella pagamento"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={submitDelete}
      />
    )}
  </>
}
