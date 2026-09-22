'use client'

import { useState } from 'react'

type Props = {
  action: (formData: FormData) => void | Promise<void>
  customer: any
  mailbox: any
}

export default function CustomerEditModal({ action, customer, mailbox }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="back-button" onClick={() => setOpen(true)}>Modifica dati cliente</button>
      {open && (
        <div className="modal-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <div className="modal-card customer-edit-modal" role="dialog" aria-modal="true" aria-labelledby="customer-edit-title" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header-row">
              <div><p className="eyebrow">CLIENTE</p><h2 id="customer-edit-title">Modifica dati cliente</h2></div>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Chiudi">×</button>
            </div>
            <form action={action} className="form" onSubmit={() => setOpen(false)}>
              <input type="hidden" name="customer_id" value={customer.id} />
              <input type="hidden" name="mailbox_id" value={mailbox?.id || ''} />
              <div className="form-grid">
                <label>Codice cliente<input name="mailbox_code" defaultValue={mailbox?.mailbox_code || ''} required maxLength={20} pattern="[A-Za-z0-9]+" /></label>
                <label>Nome<input name="first_name" defaultValue={customer.first_name || ''} required /></label>
                <label>Cognome<input name="last_name" defaultValue={customer.last_name || ''} required /></label>
                <label>Email<input type="email" name="email" defaultValue={customer.email || ''} /></label>
                <label>Telefono<input name="phone" defaultValue={customer.phone || ''} /></label>
                <label>Data apertura<input type="date" name="opened_at" defaultValue={mailbox?.opened_at || ''} /></label>
                <label>Stato casella<select name="mailbox_status" defaultValue={mailbox?.status || 'ATTIVA'}><option>ATTIVA</option><option>SOSPESA</option><option>CHIUSA</option></select></label>
                <label>Indirizzo<input name="shipping_address" defaultValue={customer.shipping_address || ''} /></label>
                <label>Città<input name="shipping_city" defaultValue={customer.shipping_city || ''} /></label>
                <label>CAP<input name="shipping_postal_code" defaultValue={customer.shipping_postal_code || ''} /></label>
                <label>Paese<input name="shipping_country" defaultValue={customer.shipping_country || ''} /></label>
                <label className="form-grid-wide">Note cliente<textarea name="notes" rows={2} defaultValue={customer.notes || ''} /></label>
                <label className="form-grid-wide">Note casella<textarea name="mailbox_notes" rows={2} defaultValue={mailbox?.notes || ''} /></label>
              </div>
              <div className="archive-modal-actions"><button type="button" onClick={() => setOpen(false)}>Annulla</button><button type="submit">Salva dati cliente</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
