import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'

type CasellePageProps = {
  searchParams: Promise<{
    search?: string
    message?: string
    error?: string
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

async function createMailbox(formData: FormData) {
  'use server'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const customerId = String(formData.get('customer_id') || '').trim()
  const status = String(formData.get('status') || 'ATTIVA').trim()
  const openedAt = String(formData.get('opened_at') || new Date().toISOString().slice(0, 10))
  const notes = String(formData.get('notes') || '').trim()

  if (!customerId) redirect('/admin/caselle?error=Seleziona un cliente.')
  if (!['ATTIVA', 'SOSPESA', 'CHIUSA'].includes(status)) redirect('/admin/caselle?error=Stato casella non valido.')

  const { data: existing } = await supabase.from('mailboxes').select('id').eq('customer_id', customerId).maybeSingle()
  if (existing) redirect('/admin/caselle?error=Il cliente selezionato ha già una casella.')

  const { error } = await supabase.from('mailboxes').insert({
    customer_id: customerId,
    status,
    opened_at: openedAt,
    notes: notes || null,
  })

  if (error) redirect(`/admin/caselle?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/caselle?message=Casella creata correttamente.')
}

export default async function CaselleAdminPage({
  searchParams,
}: CasellePageProps) {
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

  const params = await searchParams
  const search = params.search?.trim() || ''
  const message = params.message?.trim() || ''
  const errorMessage = params.error?.trim() || ''

  /*
   * CLIENTI
   */

  const { data: customers } = await supabase
    .from('customers')
    .select(
      `
        id,
        first_name,
        last_name,
        email
      `
    )

  const customerMap = new Map(
    (customers || []).map((customer) => [
      customer.id,
      customer,
    ])
  )

  /*
   * CASELLE
   */

  const { data: mailboxes, error } =
    await supabase
      .from('mailboxes')
      .select(
        `
          id,
          mailbox_code,
          customer_id,
          status,
          opened_at,
          notes,
          created_at
        `
      )
      .order('mailbox_code', {
        ascending: true,
      })

  if (error) {
    return (
      <main className="shell">
        <Navigation role="AMMINISTRATORE" active="/admin/caselle" displayName={profile?.display_name} email={user.email} />

        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">
                AMMINISTRAZIONE
              </p>

              <h1>Caselle</h1>
            </div>
          </header>

          <section className="panel">
            <h2>Caselle</h2>

            <div className="empty">
              Impossibile caricare le caselle.
            </div>
          </section>
        </section>
      </main>
    )
  }

  const rows = mailboxes || []

  /*
   * RICERCA
   */

  const filteredRows = search
    ? rows.filter((mailbox) => {
        const customer =
          customerMap.get(
            mailbox.customer_id
          )

        const text = [
          mailbox.mailbox_code,
          mailbox.status,
          customer?.first_name,
          customer?.last_name,
          customer?.email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        return text.includes(
          search.toLowerCase()
        )
      })
    : rows

  return (
    <main className="shell">
      <Navigation role="AMMINISTRATORE" active="/admin/caselle" displayName={profile?.display_name} email={user.email} />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">
              AMMINISTRAZIONE
            </p>

            <h1>Caselle</h1>
          </div>
        </header>

        {message && <section className="panel"><div className="success">{decodeURIComponent(message)}</div></section>}
        {errorMessage && <section className="panel"><div className="error">{decodeURIComponent(errorMessage)}</div></section>}

        <section className="panel">
          <h2>Crea nuova casella</h2>
          <p className="muted">Ogni cliente può avere una sola casella. Il codice casella viene generato automaticamente.</p>
          <form action={createMailbox} className="article-create-form">
            <div className="form-grid">
              <label>Cliente<select name="customer_id" required defaultValue=""><option value="">Seleziona cliente</option>{(customers || []).map((customer) => <option key={customer.id} value={customer.id}>{customer.first_name} {customer.last_name}{customer.email ? ` — ${customer.email}` : ''}</option>)}</select></label>
              <label>Stato<select name="status" defaultValue="ATTIVA"><option value="ATTIVA">ATTIVA</option><option value="SOSPESA">SOSPESA</option><option value="CHIUSA">CHIUSA</option></select></label>
              <label>Data apertura<input type="date" name="opened_at" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
              <label className="form-grid-wide">Note<textarea name="notes" rows={3} placeholder="Note opzionali" /></label>
            </div>
            <button type="submit">Crea casella</button>
          </form>
        </section>

        {/* RICERCA */}

        <section className="panel">
          <h2>Ricerca caselle</h2>

          <form
            action="/admin/caselle"
            method="get"
            className="form"
          >
            <label>
              Cerca casella o cliente

              <input
                type="search"
                name="search"
                defaultValue={search}
                placeholder="Codice, nome, cognome, email, stato..."
              />
            </label>

            <button type="submit">
              Cerca
            </button>

            {search && (
              <a
                href="/admin/caselle"
                className="back-button"
              >
                Azzera ricerca
              </a>
            )}
          </form>
        </section>

        {/* ELENCO */}

        <section className="panel">
          <h2>
            {search
              ? `Risultati per "${search}"`
              : 'Elenco caselle'}
          </h2>

          {filteredRows.length === 0 ? (
            <div className="empty">
              {search
                ? 'Nessuna casella trovata.'
                : 'Nessuna casella registrata.'}
            </div>
          ) : (
            <div className="movement-list">
              {filteredRows.map(
                (mailbox) => {
                  const customer =
                    customerMap.get(
                      mailbox.customer_id
                    )

                  return (
                    <div
                      className="movement"
                      key={mailbox.id}
                    >
                      <div>
                        <b>
                          {
                            mailbox.mailbox_code
                          }
                        </b>

                        <span>
                          Cliente:{' '}
                          {customer
                            ? `${customer.first_name} ${customer.last_name}`
                            : 'Non trovato'}
                        </span>

                        {customer?.email && (
                          <span>
                            Email:{' '}
                            {customer.email}
                          </span>
                        )}

                        <span>
                          Data apertura:{' '}
                          {formatDate(
                            mailbox.opened_at
                          )}
                        </span>

                        {mailbox.notes && (
                          <span>
                            Note:{' '}
                            {mailbox.notes}
                          </span>
                        )}
                      </div>

                      <div>
                        <span>
                          Stato:{' '}
                          <strong>
                            {mailbox.status}
                          </strong>
                        </span>

                        <span>
                          Creata:{' '}
                          {formatDate(
                            mailbox.created_at
                          )}
                        </span>
                      </div>
                    </div>
                  )
                }
              )}
            </div>
          )}
        </section>
      </section>
    </main>
  )
}
