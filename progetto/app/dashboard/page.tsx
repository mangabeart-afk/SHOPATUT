import { redirect } from 'next/navigation'
import Navigation from '../../components/navigation'
import IncomingArticlesGallery from '../../components/incoming-articles-gallery'
import WhatsAppContact from '../../components/whatsapp-contact'
import ReadOnlyNotice from '../../components/read-only-notice'
import { findSheet, getLatestExcelWorkbook, getRecentIncomingPhotoArticles, money, parseCustomerSheet } from '../../lib/excel-source'
import { requirePageContext, resolveCustomerCode } from '../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function Dashboard() {
  const { supabase, user, profile } = await requirePageContext()
  if (profile.role === 'AMMINISTRATORE') redirect('/admin')
  const customerCode = await resolveCustomerCode(supabase, profile)
  const workbook = await getLatestExcelWorkbook()
  const sheet = customerCode ? findSheet(workbook, customerCode) : null
  const customer = sheet ? parseCustomerSheet(sheet) : null
  const recentPhotos = getRecentIncomingPhotoArticles(workbook, 12)

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/dashboard" displayName={profile.display_name} email={user.email} />
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">AREA UTENTE</p><h1>Dashboard</h1></div><WhatsAppContact /></header>
        {!customer ? (
          <section className="panel"><div className="empty">Non è stata trovata una scheda Excel per il tuo profilo{customerCode ? ` (${customerCode})` : ''}. Contatta l’amministratore per associare il codice utente corretto.</div></section>
        ) : <>
          <section className="panel customer-code-balance-strip" aria-label="Codice utente e saldo">
            <div><span>Codice utente</span><strong>{customer.code}</strong></div>
            <div><span>Saldo da pagare</span><strong>{money(customer.balance)}</strong></div>
          </section>
          <section className="panel dashboard-control-panel">
            <div className="section-heading"><h2>La mia casella</h2></div>
            <div className="dashboard-control-grid">
              <div className="dashboard-control-card dashboard-control-incoming"><span>IN ARRIVO</span><strong>{customer.incomingUnits}</strong></div>
              <div className="dashboard-control-card dashboard-control-stock"><span>IN STOCK</span><strong>{customer.stockUnits}</strong></div>
              <div className="dashboard-control-card dashboard-control-box"><span>IN BOX</span><strong>{customer.boxUnits}</strong></div>
            </div>
          </section>
          <section className="panel">
            <div className="section-heading"><h2>ULTIMI ARTICOLI IN ARRIVO</h2></div>
            <IncomingArticlesGallery articles={recentPhotos} />
          </section>
          <section className="panel"><ReadOnlyNotice /><p className="muted">I dati personali di articoli, stato e saldo sono letti dalla scheda Excel <b>{customer.code}</b>.</p></section>
        </>}
      </section>
    </main>
  )
}
