import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'
import Navigation from '../../../../components/navigation'

type PageProps = {
  params: Promise<{
    id: string
  }>
}

const formatDate = (value: string | null) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

export default async function ClienteDetailPage({
  params,
}: PageProps) {
  const { id } = await params

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') {
    redirect('/dashboard')
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .select(
      `
        id,
        customer_code,
        first_name,
        last_name,
        email,
        phone,
        notes,
        shipping_address,
        shipping_city,
        shipping_postal_code,
        shipping_country,
        created_at
      `
    )
    .eq('id', id)
    .maybeSingle()

  if (error || !customer) {
    notFound()
  }

  const fullName =
    `${customer.first_name || ''} ${customer.last_name || ''}`.trim()

  const shippingAddressExists =
    Boolean(customer.shipping_address) ||
    Boolean(customer.shipping_city) ||
    Boolean(customer.shipping_postal_code) ||
    Boolean(customer.shipping_country)

  return (
    <main className="shell">
      <Navigation role="AMMINISTRATORE" active="/admin/clienti" displayName={profile?.display_name} email={user.email} />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              AMMINISTRAZIONE
            </p>

            <h1>
              {fullName || 'Cliente'}
            </h1>
          </div>

          <a
            href="/admin/clienti"
            className="back-button"
          >
            ← Clienti
          </a>
        </header>

        {/* ANAGRAFICA CLIENTE */}

        <section className="panel">
          <h2>Anagrafica cliente</h2>

          <div className="customer-details">
            <div className="customer-detail-row">
              <span className="muted">
                Codice cliente
              </span>

              <strong className="customer-value">
                {customer.customer_code ||
                  '—'}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Nome
              </span>

              <strong className="customer-value">
                {fullName || '—'}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Email
              </span>

              <strong className="customer-value">
                {customer.email || '—'}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Telefono
              </span>

              <strong className="customer-value">
                {customer.phone || '—'}
              </strong>
            </div>

            <div className="customer-detail-row">
              <span className="muted">
                Cliente dal
              </span>

              <strong className="customer-value">
                {formatDate(
                  customer.created_at
                )}
              </strong>
            </div>
          </div>

          {customer.notes && (
            <div className="customer-notes">
              <b>Note:</b>{' '}
              {customer.notes}
            </div>
          )}
        </section>

        {/* INDIRIZZO DI SPEDIZIONE */}

        <section className="panel">
          <h2>
            Indirizzo di spedizione
          </h2>

          {!shippingAddressExists ? (
            <div className="empty">
              Nessun indirizzo di
              spedizione registrato.
            </div>
          ) : (
            <div className="shipping-address">
              {customer.shipping_address && (
                <strong>
                  {customer.shipping_address}
                </strong>
              )}

              {(customer.shipping_postal_code ||
                customer.shipping_city) && (
                <span>
                  {customer.shipping_postal_code ||
                    ''}
                  {customer.shipping_postal_code &&
                  customer.shipping_city
                    ? ' '
                    : ''}
                  {customer.shipping_city ||
                    ''}
                </span>
              )}

              {customer.shipping_country && (
                <span>
                  {customer.shipping_country}
                </span>
              )}
            </div>
          )}
        </section>

        {/* GESTIONE CLIENTE */}

        <section className="panel">
          <h2>Gestione cliente</h2>

          <div className="customer-actions">
            <a
              href={`/admin/articoli?customer=${customer.id}`}
              className="customer-action"
            >
              <span className="customer-action-title">
                Articoli
              </span>

              <span className="customer-action-text">
                Gestisci gli articoli →
              </span>
            </a>

            <a
              href={`/admin/pagamenti?customer=${customer.id}`}
              className="customer-action"
            >
              <span className="customer-action-title">
                Pagamenti
              </span>

              <span className="customer-action-text">
                Gestisci i pagamenti →
              </span>
            </a>

            <a
              href={`/admin/crediti?customer=${customer.id}`}
              className="customer-action"
            >
              <span className="customer-action-title">
                Crediti
              </span>

              <span className="customer-action-text">
                Gestisci i crediti →
              </span>
            </a>

            <a
              href={`/admin/movimenti?customer=${customer.id}`}
              className="customer-action"
            >
              <span className="customer-action-title">
                Movimenti
              </span>

              <span className="customer-action-text">
                Visualizza i movimenti →
              </span>
            </a>
          </div>
        </section>
      </section>
    </main>
  )
}
