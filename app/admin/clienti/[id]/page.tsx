import { notFound, redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'

type PageProps = {
  params: Promise<{
    id: string
  }>
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
        first_name,
        last_name,
        email,
        phone,
        notes,
        created_at,
        mailboxes (
          id,
          mailbox_code,
          status,
          opened_at,
          notes
        )
      `
    )
    .eq('id', id)
    .maybeSingle()

  if (error || !customer) {
    notFound()
  }

  const mailboxes = Array.isArray(customer.mailboxes)
    ? customer.mailboxes
    : customer.mailboxes
      ? [customer.mailboxes]
      : []

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          MangaBEART <span>[ShopaTüT]</span>
        </div>

        <nav>
          <a href="/admin">
            Dashboard
          </a>

          <a
            href="/admin/clienti"
            className="active"
          >
            Clienti
          </a>

          <a href="/admin/caselle">
            Caselle
          </a>

          <a href="/admin/articoli">
            Articoli
          </a>

          <a href="/admin/pagamenti">
            Pagamenti
          </a>

          <a href="/admin/crediti">
            Crediti
          </a>

          <a href="/admin/spedizioni">
            Spedizioni
          </a>

          <a href="/admin/movimenti">
            Movimenti
          </a>
        </nav>

        <div className="side-note">
          V1 • AMMINISTRATORE
          <br />
          {profile?.display_name || user.email}
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              AMMINISTRAZIONE
            </p>

            <h1>
              {customer.first_name}{' '}
              {customer.last_name}
            </h1>
          </div>

          <a
            href="/admin/clienti"
            className="back-button"
          >
            ← Clienti
          </a>
        </header>

        <section className="panel">
          <h2>Anagrafica cliente</h2>

          <div className="grid">
            <div className="card">
              <div className="muted">
                Nome
              </div>

              <strong>
                {customer.first_name}{' '}
                {customer.last_name}
              </strong>
            </div>

            <div className="card">
              <div className="muted">
                Email
              </div>

              <strong>
                {customer.email || '—'}
              </strong>
            </div>

            <div className="card">
              <div className="muted">
                Telefono
              </div>

              <strong>
                {customer.phone || '—'}
              </strong>
            </div>

            <div className="card">
              <div className="muted">
                Caselle
              </div>

              <strong>
                {mailboxes.length}
              </strong>
            </div>
          </div>

          {customer.notes && (
            <div className="empty">
              <b>Note:</b>{' '}
              {customer.notes}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Caselle associate</h2>

          {mailboxes.length === 0 ? (
            <div className="empty">
              Nessuna casella associata.
            </div>
          ) : (
            <div className="movement-list">
              {mailboxes.map((mailbox) => (
                <div
                  className="movement"
                  key={mailbox.id}
                >
                  <div>
                    <b>
                      {mailbox.mailbox_code}
                    </b>

                    <span>
                      Stato:{' '}
                      {mailbox.status}
                    </span>

                    <span>
                      Apertura:{' '}
                      {mailbox.opened_at
                        ? new Intl.DateTimeFormat(
                            'it-IT'
                          ).format(
                            new Date(
                              mailbox.opened_at
                            )
                          )
                        : '—'}
                    </span>

                    {mailbox.notes && (
                      <span>
                        Note:{' '}
                        {mailbox.notes}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <h2>Gestione cliente</h2>

          <div className="grid">
            <a
              href={`/admin/articoli?customer=${customer.id}`}
              className="card"
            >
              <div className="muted">
                Articoli
              </div>

              <strong>
                Vai agli articoli →
              </strong>
            </a>

            <a
              href={`/admin/pagamenti?customer=${customer.id}`}
              className="card"
            >
              <div className="muted">
                Pagamenti
              </div>

              <strong>
                Vai ai pagamenti →
              </strong>
            </a>

            <a
              href={`/admin/crediti?customer=${customer.id}`}
              className="card"
            >
              <div className="muted">
                Crediti
              </div>

              <strong>
                Vai ai crediti →
              </strong>
            </a>

            <a
              href={`/admin/movimenti?customer=${customer.id}`}
              className="card"
            >
              <div className="muted">
                Movimenti
              </div>

              <strong>
                Vai ai movimenti →
              </strong>
            </a>
          </div>
        </section>
      </section>
    </main>
  )
}
