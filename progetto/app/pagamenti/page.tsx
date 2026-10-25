import { redirect } from 'next/navigation'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'
import ReadOnlyNotice from '../../components/read-only-notice'
import { findSheet, parseCustomerSheet, getLatestExcelWorkbook, dateLabel, money } from '../../lib/excel-source'
import { requirePageContext, resolveCustomerCode } from '../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function PagamentiPage() {
  const { supabase, user, profile } = await requirePageContext()
  if (profile.role === 'AMMINISTRATORE') redirect('/admin/pagamenti')
  const code = await resolveCustomerCode(supabase, profile)
  const workbook = await getLatestExcelWorkbook()
  const sheet = code ? findSheet(workbook, code) : null
  const customer = sheet ? parseCustomerSheet(sheet) : null
  const rows = (customer?.transactions || []).filter((item) => item.amountPaid != null && Math.abs(item.amountPaid) >= 0.005)
    .sort((a, b) => (b.paymentDate || b.date || '').localeCompare(a.paymentDate || a.date || '') || b.excelRow - a.excelRow)

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/pagamenti" displayName={profile.display_name} email={user.email} />
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">AREA UTENTE</p><h1>Pagamenti</h1></div><WhatsAppContact /></header>
        {!customer ? <section className="panel"><div className="empty">Scheda Excel non associata al profilo.</div></section> : <>
          <section className="grid"><div className="card"><div className="muted">Saldo da pagare</div><strong>{money(customer.balance)}</strong><small>saldo indicato nella scheda Excel {customer.code}</small></div></section>
          <section className="panel pay-now-panel">
            <div className="section-heading"><h2>Metodi pagamento</h2></div>
            <div className="pay-now-grid">
              <div className="pay-now-card"><div><p className="eyebrow">PAYPAL</p><strong>Pagamento tramite PayPal</strong><p className="muted">Seleziona <b>Amici e parenti</b>. Eventuali commissioni di PayPal saranno decurtate dal pagamento.</p></div><a href="https://www.paypal.me/RTagliafierro" target="_blank" rel="noreferrer" className="back-button">Paga con PayPal →</a></div>
              <div className="pay-now-card"><div><p className="eyebrow">BONIFICO</p><strong>Pagamento tramite bonifico</strong><div className="pay-now-bank-details"><span><b>Beneficiario:</b> Tagliafierro Raffaele</span><span><b>IBAN:</b> IT32E0359901899086928540406</span><span><b>Causale:</b> contributo giappone</span></div></div></div>
            </div>
          </section>
          <section className="panel"><h2>Storico pagamenti</h2>
            {rows.length === 0 ? <div className="empty">Nessun importo pagato registrato nella scheda Excel.</div> : <div className="movement-list">
              {rows.map((item) => <div className="movement" key={item.id}><div><b>{item.movement || 'Pagamento'}</b><span>{dateLabel(item.paymentDate || item.date)}{item.article ? ` · ${item.article}` : ''}</span>{item.notes && <span>{item.notes}</span>}</div><strong>{money(item.amountPaid)}</strong></div>)}
            </div>}
          </section>
          <section className="panel"><ReadOnlyNotice /></section>
        </>}
      </section>
    </main>
  )
}
