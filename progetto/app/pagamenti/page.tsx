import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'

const money = (n: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(n || 0)

export default async function PagamentiPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,mailbox_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role === 'AMMINISTRATORE') redirect('/admin/pagamenti')

  const mailboxId = profile?.mailbox_id

  const [{ data: payments, error: paymentsError }, { data: balance, error: balanceError }] =
    await Promise.all([
      mailboxId
        ? supabase
            .from('payments')
            .select('id,amount_eur,amount,payment_date,payment_method,status,notes')
            .eq('mailbox_id', mailboxId)
            .order('payment_date', { ascending: false }).order('id', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      mailboxId
        ? supabase.rpc('customer_balance_summary')
        : Promise.resolve({ data: 0, error: null }),
    ])

  if (paymentsError || balanceError) {
    return (
      <main className="shell">
        <Navigation role="CLIENTE" active="/pagamenti" email={user.email} />
        <section className="content">
          <header className="topbar">
            <div>
              <p className="eyebrow">AREA CLIENTE</p>
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

  const rows = payments || []
  const balanceValue = Number(balance || 0)

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/pagamenti" email={user.email} />
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA CLIENTE</p>
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
                      <b>Pagamento #{payment.id}</b>
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
        </section>
      </section>
    </main>
  )
}
