'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '../../lib/supabase-browser'

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const [shippingAddress, setShippingAddress] = useState('')
  const [shippingPostalCode, setShippingPostalCode] =
    useState('')
  const [shippingCity, setShippingCity] = useState('')
  const [shippingCountry, setShippingCountry] =
    useState('Italia')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] =
    useState('')

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()

    setError('')
    setSuccess('')

    if (password !== confirmPassword) {
      setError('Le password non coincidono.')
      return
    }

    if (password.length < 8) {
      setError(
        'La password deve contenere almeno 8 caratteri.'
      )
      return
    }

    setLoading(true)

    const supabase = createClient()

    const { data, error } =
      await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: phone.trim(),
            shipping_address:
              shippingAddress.trim(),
            shipping_postal_code:
              shippingPostalCode.trim(),
            shipping_city:
              shippingCity.trim(),
            shipping_country:
              shippingCountry.trim(),
          },
        },
      })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    if (data.session) {
      window.location.assign('/dashboard')
      return
    }

    setSuccess(
      'Registrazione completata. Controlla la tua email per confermare l’account.'
    )

    setLoading(false)
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">
          MangaBEART [ShopaTüT]
        </p>

        <h1>Registrazione</h1>

        <p className="muted">
          Crea il tuo account cliente.
        </p>

        <form
          onSubmit={submit}
          className="form"
        >
          <label>
            Nome
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) =>
                setFirstName(e.target.value)
              }
              autoComplete="given-name"
            />
          </label>

          <label>
            Cognome
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) =>
                setLastName(e.target.value)
              }
              autoComplete="family-name"
            />
          </label>

          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              autoComplete="email"
            />
          </label>

          <label>
            Telefono
            <input
              type="tel"
              value={phone}
              onChange={(e) =>
                setPhone(e.target.value)
              }
              autoComplete="tel"
            />
          </label>

          <div className="form-section">
            <h2>Indirizzo di spedizione</h2>

            <label>
              Indirizzo
              <input
                type="text"
                required
                value={shippingAddress}
                onChange={(e) =>
                  setShippingAddress(
                    e.target.value
                  )
                }
                placeholder="Via/Piazza e numero civico"
                autoComplete="street-address"
              />
            </label>

            <label>
              CAP
              <input
                type="text"
                required
                value={shippingPostalCode}
                onChange={(e) =>
                  setShippingPostalCode(
                    e.target.value
                  )
                }
                autoComplete="postal-code"
                inputMode="numeric"
              />
            </label>

            <label>
              Città
              <input
                type="text"
                required
                value={shippingCity}
                onChange={(e) =>
                  setShippingCity(
                    e.target.value
                  )
                }
                autoComplete="address-level2"
              />
            </label>

            <label>
              Paese
              <input
                type="text"
                required
                value={shippingCountry}
                onChange={(e) =>
                  setShippingCountry(
                    e.target.value
                  )
                }
                autoComplete="country-name"
              />
            </label>
          </div>

          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) =>
                setPassword(e.target.value)
              }
              autoComplete="new-password"
            />
          </label>

          <label>
            Conferma password
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) =>
                setConfirmPassword(
                  e.target.value
                )
              }
              autoComplete="new-password"
            />
          </label>

          {error && (
            <div className="error">
              {error}
            </div>
          )}

          {success && (
            <div className="success">
              {success}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Registrazione…'
              : 'Crea account'}
          </button>

          <a
            href="/login"
            className="auth-link"
          >
            Hai già un account? Accedi
          </a>
        </form>
      </section>
    </main>
  )
}
