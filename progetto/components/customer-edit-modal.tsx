'use client'

import { FormEvent, useState } from 'react'

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
            <form
              action={action}
              className="form"
              onSubmit={(event: FormEvent<HTMLFormElement>) => {
                const emailInput = event.currentTarget.elements.namedItem('email') as HTMLInputElement | null
                const originalEmail = String(customer.email || '').trim().toLowerCase()
                const nextEmail = String(emailInput?.value || '').trim().toLowerCase()

                if (originalEmail !== nextEmail && nextEmail) {
                  const confirmed = window.confirm(
                    'Stai modificando l\'indirizzo email del cliente. Al nuovo indirizzo verrà inviato un messaggio per impostare una nuova password. Continuare?'
                  )
                  if (!confirmed) {
                    event.preventDefault()
                    return
                  }
                }

                setOpen(false)
              }}
            >
              <input type="hidden" name="customer_id" value={customer.id} />
              <input type="hidden" name="mailbox_id" value={mailbox?.id || ''} />
              <div className="form-grid">
                <label>Codice utente<input name="customer_code" defaultValue={customer?.customer_code || ''} required maxLength={20} pattern="[A-Za-z0-9]+" /></label>
                <label>Nome<input name="first_name" defaultValue={customer.first_name || ''} required /></label>
                <label>Cognome<input name="last_name" defaultValue={customer.last_name || ''} required /></label>
                <label>Email<input type="email" name="email" defaultValue={customer.email || ''} /></label>
                <label>Telefono<input name="phone" defaultValue={customer.phone || ''} /></label>
                <label>Metodo di pagamento preferito<select name="preferred_payment_method" defaultValue={customer.preferred_payment_method || ''}><option value="">Non specificato</option><option value="BONIFICO">Bonifico</option><option value="PAYPAL">PayPal</option><option value="CARTA">Carta</option><option value="CONTANTI">Contanti</option><option value="ALTRO">Altro</option></select></label>
                <label>Indirizzo<input name="shipping_address" defaultValue={customer.shipping_address || ''} /></label>
                <label>Città<input name="shipping_city" defaultValue={customer.shipping_city || ''} /></label>
                <label>CAP<input name="shipping_postal_code" defaultValue={customer.shipping_postal_code || ''} /></label>
                <label>Paese<input name="shipping_country" defaultValue={customer.shipping_country || ''} /></label>
                <label className="form-grid-wide">Note cliente<textarea name="mailbox_notes" rows={2} defaultValue={mailbox?.notes || ''} /></label>
              </div>
              <div className="archive-modal-actions"><button type="button" onClick={() => setOpen(false)}>Annulla</button><button type="submit">Salva dati cliente</button></div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
