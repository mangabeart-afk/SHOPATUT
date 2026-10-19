import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

type PagamentiPageProps = { searchParams: Promise<{ page?: string }> }

export default async function PagamentiPage({ searchParams }: PagamentiPageProps) {
  const supabase = await createClient()
  const params = await searchParams
  const pageSize = 100
  const requestedPage = Math.max(1, Number.parseInt(params.page || '1', 10) || 1)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,mailbox_id,customer_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role === 'AMMINISTRATORE') redirect('/admin/pagamenti')

  let mailboxId = profile?.mailbox_id || null
  if (!mailboxId && profile?.customer_id) {
    const { data: fallbackMailbox } = await supabase
      .from('mailboxes')
      .select('id')
      .eq('customer_id', profile.customer_id)
      .maybeSingle()
    mailboxId = fallbackMailbox?.id || null
  }

  const [{ data: payments, error: paymentsError, count: paymentCount }, { data: customerSummaryRows, error: balanceError }] = await Promise.all([
    mailboxId
      ? supabase
          .from('payments')
          .select('id,payment_code,amount_eur,amount,payment_date,payment_method,status,notes', { count: 'exact' })
          .eq('mailbox_id', mailboxId)
          .order('payment_date', { ascending: false })
          .order('id', { ascending: false })
          .range((requestedPage - 1) * pageSize, requestedPage * pageSize - 1)
      : Promise.resolve({ data: [], error: null, count: 0 }),
    mailboxId
      ? supabase.rpc('customer_dashboard_summary')
      : Promise.resolve({ data: null, error: null }),
  ])

  if (paymentsError || balanceError) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/pagamenti" email={user.email} />
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA UTENTE</p>
              <h1>Pagamenti</h1>
            </div>
            <WhatsAppContact />
          </header>
          <section className="panel">
            <h2>I miei pagamenti</h2>
            <div className="empty">Impossibile caricare i pagamenti.</div>
          </section>
        </section>
      </main>
    )
  }

  const totalPages = Math.max(1, Math.ceil(Number(paymentCount || 0) / pageSize))
  let currentPage = Math.min(requestedPage, totalPages)
  let rows = payments || []
  if (mailboxId && requestedPage > totalPages && Number(paymentCount || 0) > 0) {
    const { data: lastPageRows } = await supabase
      .from('payments')
      .select('id,payment_code,amount_eur,amount,payment_date,payment_method,status,notes')
      .eq('mailbox_id', mailboxId)
      .order('payment_date', { ascending: false })
      .order('id', { ascending: false })
      .range((totalPages - 1) * pageSize, totalPages * pageSize - 1)
    rows = lastPageRows || []
    currentPage = totalPages
  }
  const balanceRow = Array.isArray(customerSummaryRows) ? customerSummaryRows[0] : customerSummaryRows
  const balanceValue = Number((balanceRow as any)?.balance_eur || 0)

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/pagamenti" email={user.email} />
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA UTENTE</p>
            <h1>Pagamenti</h1>
          </div>
          <WhatsAppContact />
        </header>

        <div className="grid">
          <div className="card">
            <div className="muted">Saldo</div>
            <strong>{money(balanceValue)}</strong>
            <small>saldo casella</small>
          </div>

        </div>

        <section className="panel pay-now-panel">
          <div className="section-heading">
            <h2>Metodi pagamento</h2>
          </div>

          <div className="pay-now-grid">
            <div className="pay-now-card">
              <div>
                <p className="eyebrow">PAYPAL</p>
                <strong>Pagamento tramite PayPal</strong>
                <p className="muted">
                  Seleziona <b>Amici e parenti</b>. Eventuali commissioni di PayPal saranno decurtate dal pagamento.
                </p>
              </div>
              <a href="https://www.paypal.me/RTagliafierro" target="_blank" rel="noreferrer" className="back-button">
                Paga con PayPal →
              </a>
            </div>

            <div className="pay-now-card">
              <div>
                <p className="eyebrow">BONIFICO</p>
                <strong>Pagamento tramite bonifico</strong>
                <div className="pay-now-bank-details">
                  <span><b>Beneficiario:</b> Tagliafierro Raffaele</span>
                  <span><b>IBAN:</b> IT32E0359901899086928540406</span>
          <span><b>Causale:</b> contributo giappone</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Storico pagamenti</h2>
          {rows.length === 0 ? (
            <div className="empty">Nessun pagamento registrato.</div>
          ) : (
            <div className="movement-list">
              {rows.map((payment: any) => {
                const amount = Number(payment.amount_eur ?? payment.amount ?? 0)
                return (
                  <div className="movement" key={payment.id}>
                    <div>
                      <b>{payment.payment_code || `Pagamento #${payment.id}`}</b>
                      {payment.payment_date && <span>{new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit'}).format(new Date(payment.payment_date))}</span>}
                      {payment.payment_method && <span>{payment.payment_method}</span>}
                      {payment.notes && <span>{payment.notes}</span>}
                    </div>
                    <strong>{money(amount)}</strong>
                  </div>
                )
              })}
            </div>
          )}
          {Number(paymentCount || 0) > pageSize && (
            <nav aria-label="Paginazione pagamenti" className="server-archive-pagination">
              <a className="filter-submit" href={`/pagamenti?page=${Math.max(1, currentPage - 1)}`} aria-disabled={currentPage <= 1}>‹ Precedente</a>
              <span>Pagina {currentPage} di {totalPages} · {paymentCount} pagamenti</span>
              <a className="filter-submit" href={`/pagamenti?page=${Math.min(totalPages, currentPage + 1)}`} aria-disabled={currentPage >= totalPages}>Successiva ›</a>
            </nav>
          )}
        </section>
      </section>
    </main>
  )
}
