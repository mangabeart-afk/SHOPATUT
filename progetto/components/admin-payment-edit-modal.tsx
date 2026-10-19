'use client'

import { useState } from 'react'
import ModalPortal from './modal-portal'

type Payment = { id: string; payment_code: string; payment_date: string; amount_eur: number | null; payment_method: string | null; notes: string | null; status: string }
type Props = { action: (formData: FormData) => void | Promise<void>; deleteAction: (formData: FormData) => void | Promise<void>; payment: Payment }

export default function AdminPaymentEditModal({ action, deleteAction, payment }: Props) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="table-action" onClick={() => setOpen(true)}>Modifica</button>
    {open && <ModalPortal><div className="modal-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={`Modifica pagamento ${payment.payment_code}`} onMouseDown={event => event.stopPropagation()}>
        <div className="section-heading"><div><p className="eyebrow">MODIFICA PAGAMENTO</p><h2>{payment.payment_code}</h2></div><button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Chiudi">×</button></div>
        <form action={action} className="form-grid">
          <input type="hidden" name="payment_id" value={payment.id}/>
          <label>Importo (€)<input type="number" name="amount" min="0.01" step="0.01" defaultValue={Number(payment.amount_eur || 0).toFixed(2)} required/></label>
          <label>Data<input type="date" name="payment_date" defaultValue={payment.payment_date} required/></label>
          <label className="form-grid-full">Metodo<input name="payment_method" defaultValue={payment.payment_method || ''}/></label>
          <label className="form-grid-full">Note<textarea name="notes" rows={3} defaultValue={payment.notes || ''}/></label>
          <div className="modal-actions"><button type="button" className="back-button" onClick={() => setOpen(false)}>Annulla</button><button type="submit" className="primary-button">Salva modifiche</button><button type="submit" formAction={deleteAction} className="danger-button" onClick={event => { if (!window.confirm(`Cancellare il pagamento ${payment.payment_code}? L'eventuale assegnazione verrà annullata.`)) event.preventDefault() }}>Elimina</button></div>
        </form>
      </div>
    </div></ModalPortal>}
  </>
}
