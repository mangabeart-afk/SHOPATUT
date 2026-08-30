import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'

export default async function CasellePage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: mailboxes, error } = await supabase
    .from('mailboxes')
    .select('id,status')
    .order('id', { ascending: false })

  if (error) {
    return (
      <main className="shell">
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA CLIENTE</p>
              <h1>Caselle</h1>
            </div>

            <a href="/dashboard" className="back-button">
              ← Dashboard
            </a>
          </header>

          <section className="panel">
            <h2>Le mie caselle</h2>

            <div className="empty">
              Impossibile caricare le caselle.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const rows = mailboxes || []

  const active = rows.filter(
    (mailbox) =>
      String(mailbox.status || '').toUpperCase() === 'ATTIVA' ||
      String(mailbox.status || '').toUpperCase() === 'ACTIVE'
  ).length

  return (
    <main className="shell">
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA CLIENTE</p>
            <h1>Caselle</h1>
          </div>

          <a href="/dashboard" className="back-button">
            ← Dashboard
          </a>
        </header>

        <div className="grid">
          <div className="card">
            <div className="muted">Caselle totali</div>
            <strong>{rows.length}</strong>
            <small>caselle visibili</small>
          </div>

          <div className="card">
            <div className="muted">Caselle attive</div>
            <strong>{active}</strong>
            <small>caselle attualmente attive</small>
          </div>
        </div>

        <section className="panel">
          <h2>Le mie caselle</h2>

          {rows.length === 0 ? (
            <div className="empty">
              Nessuna casella disponibile.
            </div>
          ) : (
            <div className="movement-list">
              {rows.map((mailbox) => (
                <div className="movement" key={mailbox.id}>
                  <div>
                    <b>Casella #{mailbox.id}</b>
                    <span>Casella cliente</span>
                  </div>

                  <strong>
                    {mailbox.status || '—'}
                  </strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
