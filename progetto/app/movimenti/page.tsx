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

type MovimentiPageProps = { searchParams: Promise<{ page?: string }> }

export default async function MovimentiPage({ searchParams }: MovimentiPageProps) {
  const supabase = await createClient()
  const params = await searchParams
  const pageSize = 100
  const requestedPage = Math.max(1, Number.parseInt(params.page || '1', 10) || 1)

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
              <p className="eyebrow">AREA UTENTE</p>
              <h1>Movimenti</h1>
            </div>
          <WhatsAppContact /></header>

          <section className="panel">
            <h2>I miei movimenti</h2>

            <div className="empty">
              Nessuna casella associata all’utente.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const { data: movements, error, count: movementCount } = await supabase
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
      `,
      { count: 'exact' },
    )
    .eq('mailbox_id', profile.mailbox_id)
    .order('movement_at', { ascending: false })
    .order('id', { ascending: false })
    .range((requestedPage - 1) * pageSize, requestedPage * pageSize - 1)

  if (error) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/movimenti" email={user.email} />
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA UTENTE</p>
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

  const totalPages = Math.max(1, Math.ceil(Number(movementCount || 0) / pageSize))
  let currentPage = Math.min(requestedPage, totalPages)
  let rows = movements || []
  if (requestedPage > totalPages && Number(movementCount || 0) > 0) {
    const { data: lastPageRows } = await supabase
      .from('movements')
      .select('id,movement_code,movement_at,movement_type,reference_code,article_id,quantity,unit_price_eur,total_amount_eur,description,notes')
      .eq('mailbox_id', profile.mailbox_id)
      .order('movement_at', { ascending: false })
      .order('id', { ascending: false })
      .range((totalPages - 1) * pageSize, totalPages * pageSize - 1)
    rows = lastPageRows || []
    currentPage = totalPages
  }

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/movimenti" email={user.email} />
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA UTENTE</p>
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
          {Number(movementCount || 0) > pageSize && (
            <nav aria-label="Paginazione movimenti" className="server-archive-pagination">
              <a className="filter-submit" href={`/movimenti?page=${Math.max(1, currentPage - 1)}`} aria-disabled={currentPage <= 1}>‹ Precedente</a>
              <span>Pagina {currentPage} di {totalPages} · {movementCount} movimenti</span>
              <a className="filter-submit" href={`/movimenti?page=${Math.min(totalPages, currentPage + 1)}`} aria-disabled={currentPage >= totalPages}>Successiva ›</a>
            </nav>
          )}
        </section>
      </section>
    </main>
  )
}
