'use client'

import { useState } from 'react'

type Props = {
  action: (formData: FormData) => void | Promise<void>
}

export default function CustomerCreateModal({ action }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" className="primary-button" onClick={() => setOpen(true)}>
        + Nuovo cliente
      </button>
      {open && (
        <div className="modal-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
          <div
            className="modal-card customer-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-create-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="modal-header-row">
              <div>
                <p className="eyebrow">CLIENTE</p>
                <h2 id="customer-create-title">Nuovo cliente</h2>
              </div>
              <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Chiudi">×</button>
            </div>

            <form action={action} className="form">
              <div className="form-grid">
                <label>Nome<input name="first_name" required /></label>
                <label>Cognome<input name="last_name" required /></label>
                <label>Mail<input type="email" name="email" required /></label>
                <label>Telefono<input name="phone" /></label>
                <label>Indirizzo spedizione<input name="shipping_address" /></label>
                <label>Città<input name="shipping_city" /></label>
                <label>CAP<input name="shipping_postal_code" /></label>
                <label>Paese<input name="shipping_country" defaultValue="Italia" /></label>
                <label className="form-grid-wide">Note<textarea name="mailbox_notes" rows={3} /></label>
              </div>
              <div className="archive-modal-actions">
                <button type="button" onClick={() => setOpen(false)}>Annulla</button>
                <button type="submit">Crea cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
