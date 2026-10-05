'use client'

import { useState } from 'react'
import type { FormEvent } from 'react'
import { createClient } from '../lib/supabase-browser'

type ShippingAddressFormProps = {
  initialAddress: string | null
  initialPostalCode: string | null
  initialCity: string | null
  initialCountry: string | null
}

export default function ShippingAddressForm({
  initialAddress,
  initialPostalCode,
  initialCity,
  initialCountry,
}: ShippingAddressFormProps) {
  const [address, setAddress] = useState(initialAddress || '')
  const [postalCode, setPostalCode] = useState(initialPostalCode || '')
  const [city, setCity] = useState(initialCity || '')
  const [country, setCountry] = useState(initialCountry || '')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [supabase] = useState(() => createClient())

  async function saveAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFeedback(null)

    try {
      const { error } = await supabase.rpc('update_my_shipping_address', {
        p_shipping_address: address,
        p_shipping_postal_code: postalCode,
        p_shipping_city: city,
        p_shipping_country: country,
      })

      if (error) {
        setFeedback({ type: 'error', message: 'Non è stato possibile salvare l’indirizzo. Riprova.' })
        return
      }

      setFeedback({ type: 'success', message: 'Indirizzo di spedizione aggiornato.' })
    } catch {
      setFeedback({ type: 'error', message: 'Connessione non disponibile. Controlla la rete e riprova.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="panel shipping-address-panel">
      <div className="section-heading">
        <div>
          <h2>Indirizzo di spedizione</h2>
          <p className="muted">Controlla e aggiorna i dati a cui desideri ricevere le spedizioni.</p>
        </div>
      </div>

      <form className="shipping-address-form" onSubmit={saveAddress}>
        <label>
          Indirizzo e numero civico
          <input
            type="text"
            autoComplete="street-address"
            maxLength={250}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Via, numero civico"
          />
        </label>

        <div className="shipping-address-grid">
          <label>
            CAP
            <input
              type="text"
              autoComplete="postal-code"
              maxLength={20}
              value={postalCode}
              onChange={(event) => setPostalCode(event.target.value)}
              placeholder="CAP"
            />
          </label>
          <label>
            Città
            <input
              type="text"
              autoComplete="address-level2"
              maxLength={100}
              value={city}
              onChange={(event) => setCity(event.target.value)}
              placeholder="Città"
            />
          </label>
          <label>
            Paese
            <input
              type="text"
              autoComplete="country-name"
              maxLength={100}
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              placeholder="Paese"
            />
          </label>
        </div>

        <div className="shipping-address-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Salvataggio…' : 'Salva indirizzo'}
          </button>
          {feedback && (
            <p className={`shipping-address-feedback ${feedback.type}`} role="status" aria-live="polite">
              {feedback.message}
            </p>
          )}
        </div>
      </form>
    </section>
  )
}
