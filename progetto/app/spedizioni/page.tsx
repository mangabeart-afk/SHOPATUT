import { redirect } from 'next/navigation'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'
import ReadOnlyNotice from '../../components/read-only-notice'
import ReadOnlyTable from '../../components/read-only-table'
import { findSheet, parseCustomerSheet, getLatestExcelWorkbook, dateLabel, money } from '../../lib/excel-source'
import { requirePageContext, resolveCustomerCode } from '../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function SpedizioniPage() {
  const { supabase, user, profile } = await requirePageContext()
  if (profile.role === 'AMMINISTRATORE') redirect('/admin/spedizioni')
  const code = await resolveCustomerCode(supabase, profile)
  const workbook = await getLatestExcelWorkbook()
  const sheet = code ? findSheet(workbook, code) : null
  const customer = sheet ? parseCustomerSheet(sheet) : null
  const rows = (customer?.items || []).filter((item) => item.status === 'SPEDITO').map((item) => ({
    id: item.id,
    date: dateLabel(item.date),
    movement: item.movement || 'Ordine',
    article: item.article,
    quantity: String(item.quantity),
    amount: item.amount != null ? money(item.amount) : '—',
  })).sort((a, b) => b.id.localeCompare(a.id))

  return <main className="shell"><Navigation role="CLIENTE" active="/spedizioni" displayName={profile.display_name} email={user.email} /><section className="content">
    <header className="topbar"><div><p className="eyebrow">AREA UTENTE</p><h1>Spedizioni</h1></div><WhatsAppContact /></header>
    {!customer ? <section className="panel"><div className="empty">Scheda Excel non associata al profilo.</div></section> : <>
      <section className="grid"><div className="card"><div className="muted">Unità spedite (scheda Excel)</div><strong>{customer.shippedUnits}</strong></div><div className="card"><div className="muted">Saldo da pagare</div><strong>{money(customer.balance)}</strong></div></section>
      <section className="panel"><h2>Articoli segnati SPEDITO</h2><ReadOnlyTable columns={[{key:'date',label:'Data'},{key:'article',label:'Articolo'},{key:'movement',label:'Movimento'},{key:'quantity',label:'Q.tà',align:'right'},{key:'amount',label:'Importo',align:'right'}]} rows={rows} emptyLabel="Nessun articolo con stato SPEDITO trovato nella scheda Excel." /></section>
      <section className="panel"><ReadOnlyNotice /></section>
    </>}
  </section></main>
}
