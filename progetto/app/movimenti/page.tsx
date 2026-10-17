import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

const formatDate = (value: string | null) => {
  if (!value) return '—'

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default async function MovimentiPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('mailbox_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!profile?.mailbox_id) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/movimenti" email={user.email} />
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA CLIENTE</p>
              <h1>Movimenti</h1>
            </div>
          <WhatsAppContact /></header>

          <section className="panel">
            <h2>I miei movimenti</h2>

            <div className="empty">
              Nessuna casella associata al cliente.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const { data: movements, error } = await supabase
    .from('movements')
    .select(
      `
        id,
        movement_code,
        movement_at,
        movement_type,
        reference_code,
        article_id,
        quantity,
        unit_price_eur,
        total_amount_eur,
        description,
        notes
      `
    )
    .eq('mailbox_id', profile.mailbox_id)
    .order('movement_at', { ascending: false })

  if (error) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/movimenti" email={user.email} />
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA CLIENTE</p>
              <h1>Movimenti</h1>
            </div>
          <WhatsAppContact /></header>

          <section className="panel">
            <h2>I miei movimenti</h2>

            <div className="empty">
              Impossibile caricare i movimenti.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const rows = movements || []

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/movimenti" email={user.email} />
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA CLIENTE</p>
            <h1>Movimenti</h1>
          </div>
        <WhatsAppContact /></header>

        <section className="panel">
          <h2>Storico movimenti</h2>

          {rows.length === 0 ? (
            <div className="empty">
              Nessun movimento registrato.
            </div>
          ) : (
            <div className="movement-list">
              {rows.map((movement) => (
                <div
                  className="movement customer-movement-row"
                  key={movement.id}
                >
                  <div>
                    <b>{movement.movement_code}</b>
                    <span>
                      {movement.movement_type} · {formatDate(movement.movement_at)}
                    </span>

                    {movement.description && (
                      <span>{movement.description}</span>
                    )}

                    {movement.reference_code && (
                      <span>Riferimento: {movement.reference_code}</span>
                    )}

                    {movement.quantity !== null && (
                      <span>Quantità: {movement.quantity}</span>
                    )}

                    {movement.unit_price_eur !== null && (
                      <span>
                        Prezzo unitario: {money(Number(movement.unit_price_eur))}
                      </span>
                    )}

                    {movement.total_amount_eur !== null && (
                      <strong>
                        Totale: {money(Number(movement.total_amount_eur))}
                      </strong>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
