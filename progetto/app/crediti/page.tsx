import { redirect } from 'next/navigation'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'
import ReadOnlyNotice from '../../components/read-only-notice'
import ReadOnlyTable from '../../components/read-only-table'
import { findSheet, parseCustomerSheet, getLatestExcelWorkbook, dateLabel, money } from '../../lib/excel-source'
import { requirePageContext, resolveCustomerCode } from '../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function CreditiPage() {
  const { supabase, user, profile } = await requirePageContext()
  if (profile.role === 'AMMINISTRATORE') redirect('/admin/crediti')
  const code = await resolveCustomerCode(supabase, profile)
  const workbook = await getLatestExcelWorkbook()
  const sheet = code ? findSheet(workbook, code) : null
  const customer = sheet ? parseCustomerSheet(sheet) : null
  // Il workbook non ha una tabella autonoma dei crediti: qui si mostrano le rettifiche esplicite presenti nella scheda utente.
  const rows = (customer?.transactions || []).filter((item) => /CASHBACK|CREDITO|RIMBORSO/i.test(item.movement) || (item.amount != null && item.amount < 0)).map((item) => ({
    id: item.id,
    date: dateLabel(item.date),
    type: item.movement || 'Rettifica',
    article: item.article || '—',
    amount: item.amount != null ? money(item.amount) : '—',
    paid: item.amountPaid != null ? money(item.amountPaid) : '—',
    note: item.notes || '—',
  })).sort((a, b) => b.id.localeCompare(a.id))

  return <main className="shell"><Navigation role="CLIENTE" active="/crediti" displayName={profile.display_name} email={user.email} /><section className="content">
    <header className="topbar"><div><p className="eyebrow">AREA UTENTE</p><h1>Crediti e rettifiche</h1></div><WhatsAppContact /></header>
    {!customer ? <section className="panel"><div className="empty">Scheda Excel non associata al profilo.</div></section> : <>
      <section className="grid"><div className="card"><div className="muted">Saldo indicato in Excel</div><strong>{money(customer.balance)}</strong></div></section>
      <section className="panel"><h2>Rettifiche registrate</h2><p className="muted">Questa scheda riporta solo righe esplicite di cashback, credito o rimborso. Il workbook non contiene una tabella separata di crediti residui.</p><ReadOnlyTable columns={[{key:'date',label:'Data'},{key:'type',label:'Tipo'},{key:'article',label:'Riferimento'},{key:'amount',label:'Importo',align:'right'},{key:'paid',label:'Pagato',align:'right'},{key:'note',label:'Note'}]} rows={rows} emptyLabel="Nessuna rettifica di credito esplicita trovata nella scheda Excel." /></section>
      <section className="panel"><ReadOnlyNotice /></section>
    </>}
  </section></main>
}
