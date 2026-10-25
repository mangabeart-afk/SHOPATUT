'use client'

import { FormEvent, useRef, useState } from 'react'
import ModalPortal from './modal-portal'
import ViewportConfirmDialog from './viewport-confirm-dialog'

type ProfileCustomer = {
  id: string
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  shipping_address?: string | null
  shipping_city?: string | null
  shipping_postal_code?: string | null
  shipping_country?: string | null
}

type Props = {
  action: (formData: FormData) => void | Promise<void>
  customer: ProfileCustomer
  returnCode: string
}

export default function CustomerProfileEditModal({ action, customer, returnCode }: Props) {
  const [open, setOpen] = useState(false)
  const [emailChangeConfirmOpen, setEmailChangeConfirmOpen] = useState(false)
  const formRef = useRef<HTMLFormElement | null>(null)
  const emailChangeConfirmed = useRef(false)

  const confirmEmailChange = () => {
    emailChangeConfirmed.current = true
    setEmailChangeConfirmOpen(false)
    formRef.current?.requestSubmit()
  }

  return (
    <>
      <button type="button" className="back-button" onClick={() => setOpen(true)}>
        Modifica dati utente
      </button>
      {open && (
        <ModalPortal>
          <div className="modal-overlay" role="presentation" onMouseDown={() => setOpen(false)}>
            <div className="modal-card customer-edit-modal" role="dialog" aria-modal="true" aria-labelledby="customer-profile-edit-title" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-header-row">
                <div>
                  <p className="eyebrow">PROFILO E ACCESSO</p>
                  <h2 id="customer-profile-edit-title">Modifica dati utente</h2>
                </div>
                <button type="button" className="modal-close" onClick={() => setOpen(false)} aria-label="Chiudi">×</button>
              </div>
              <p className="muted">Questa modifica riguarda solo i dati del profilo e l’accesso dell’utente. Articoli, saldi, pagamenti e dati contabili rimangono in sola lettura.</p>
              <form
                ref={formRef}
                action={action}
                className="form"
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  const emailInput = event.currentTarget.elements.namedItem('email') as HTMLInputElement | null
                  const originalEmail = String(customer.email || '').trim().toLowerCase()
                  const nextEmail = String(emailInput?.value || '').trim().toLowerCase()
                  if (originalEmail !== nextEmail && !emailChangeConfirmed.current) {
                    event.preventDefault()
                    setEmailChangeConfirmOpen(true)
                    return
                  }
                  emailChangeConfirmed.current = false
                  setOpen(false)
                }}
              >
                <input type="hidden" name="customer_id" value={customer.id} />
                <input type="hidden" name="return_code" value={returnCode} />
                <div className="form-grid">
                  <label>Nome<input name="first_name" defaultValue={customer.first_name || ''} required maxLength={100} autoComplete="given-name" /></label>
                  <label>Cognome<input name="last_name" defaultValue={customer.last_name || ''} required maxLength={100} autoComplete="family-name" /></label>
                  <label className="form-grid-wide">Email per l’accesso e il recupero password<input type="email" name="email" defaultValue={customer.email || ''} required maxLength={254} autoComplete="email" /></label>
                  <label>Cellulare<input name="phone" defaultValue={customer.phone || ''} maxLength={40} autoComplete="tel" /></label>
                  <label>Indirizzo di spedizione<input name="shipping_address" defaultValue={customer.shipping_address || ''} maxLength={250} autoComplete="street-address" /></label>
                  <label>Città<input name="shipping_city" defaultValue={customer.shipping_city || ''} maxLength={100} autoComplete="address-level2" /></label>
                  <label>CAP<input name="shipping_postal_code" defaultValue={customer.shipping_postal_code || ''} maxLength={20} autoComplete="postal-code" /></label>
                  <label className="form-grid-wide">Paese<input name="shipping_country" defaultValue={customer.shipping_country || ''} maxLength={100} autoComplete="country-name" /></label>
                </div>
                <div className="archive-modal-actions">
                  <button type="button" onClick={() => setOpen(false)}>Annulla</button>
                  <button type="submit">Salva dati utente</button>
                </div>
              </form>
            </div>
          </div>
        </ModalPortal>
      )}
      {emailChangeConfirmOpen && (
        <ViewportConfirmDialog
          title="Conferma cambio email"
          message="L’indirizzo email dell’account sarà aggiornato. Verrà inviato al nuovo indirizzo un link per impostare una nuova password, necessario per accedere al profilo. Continuare?"
          confirmLabel="Aggiorna email e invia link"
          onCancel={() => setEmailChangeConfirmOpen(false)}
          onConfirm={confirmEmailChange}
        />
      )}
    </>
  )
}
