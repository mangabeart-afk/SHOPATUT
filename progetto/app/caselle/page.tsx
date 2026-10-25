import { redirect } from 'next/navigation'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'
import ReadOnlyNotice from '../../components/read-only-notice'
import ReadOnlyTable from '../../components/read-only-table'
import { findSheet, parseCustomerSheet, getLatestExcelWorkbook, dateLabel, money } from '../../lib/excel-source'
import { requirePageContext, resolveCustomerCode } from '../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CasellePage() {
  const { supabase, user, profile } = await requirePageContext()
  if (profile.role === 'AMMINISTRATORE') redirect('/admin/clienti')
  const code = await resolveCustomerCode(supabase, profile)
  const workbook = await getLatestExcelWorkbook()
  const sheet = code ? findSheet(workbook, code) : null
  const customer = sheet ? parseCustomerSheet(sheet) : null
  const rows = (customer?.transactions || []).map((item) => ({
    id: item.id,
    date: dateLabel(item.date),
    movement: item.movement || '—',
    article: item.article || '—',
    quantity: item.quantity ? String(item.quantity) : '—',
    status: item.status || '—',
    amount: item.amount != null ? money(item.amount) : '—',
    paid: item.amountPaid != null ? money(item.amountPaid) : '—',
  }))

  return <main className="shell"><Navigation role="CLIENTE" active="/caselle" displayName={profile.display_name} email={user.email} /><section className="content">
    <header className="topbar"><div><p className="eyebrow">AREA UTENTE</p><h1>La mia casella</h1></div><WhatsAppContact /></header>
    {!customer ? <section className="panel"><div className="empty">Scheda Excel non associata al profilo.</div></section> : <>
      <section className="grid"><div className="card"><div className="muted">Codice utente</div><strong>{customer.code}</strong></div><div className="card"><div className="muted">Saldo</div><strong>{money(customer.balance)}</strong></div><div className="card"><div className="muted">IN ARRIVO</div><strong>{customer.incomingUnits}</strong></div><div className="card"><div className="muted">IN STOCK</div><strong>{customer.stockUnits}</strong></div><div className="card"><div className="muted">IN BOX</div><strong>{customer.boxUnits}</strong></div><div className="card"><div className="muted">SPEDITO</div><strong>{customer.shippedUnits}</strong></div></section>
      <section className="panel"><h2>Righe della scheda {customer.code}</h2><ReadOnlyTable columns={[{key:'date',label:'Data'},{key:'movement',label:'Movimento'},{key:'article',label:'Articolo'},{key:'quantity',label:'Q.tà',align:'right'},{key:'amount',label:'Importo',align:'right'},{key:'paid',label:'Pagato',align:'right'},{key:'status',label:'Stato'}]} rows={rows} /></section>
      <section className="panel"><ReadOnlyNotice /></section>
    </>}
  </section></main>
}
