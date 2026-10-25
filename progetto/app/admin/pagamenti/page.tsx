import AdminWorkbookLayout from '../../../components/admin-workbook-layout'
import ReadOnlyTable from '../../../components/read-only-table'
import { getAllCustomerSheets, getLatestExcelWorkbook, dateLabel, money, searchText } from '../../../lib/excel-source'
import { requirePageContext } from '../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function AdminPagamentiPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { user, profile } = await requirePageContext('AMMINISTRATORE')
  const { search = '' } = await searchParams
  const workbook = await getLatestExcelWorkbook()
  const rows = getAllCustomerSheets(workbook).flatMap((customer) => customer.transactions.filter((item) => item.amountPaid != null && Math.abs(item.amountPaid) >= 0.005).map((item) => ({ id: item.id, code: customer.code, customer: customer.name, sortDate: item.paymentDate || item.date || '', date: dateLabel(item.paymentDate || item.date), type: item.movement || 'Pagamento', reference: item.article || '—', amount: money(item.amountPaid), notes: item.notes || '—' })))
    .filter((item) => searchText([item.code,item.customer,item.type,item.reference,item.date,item.notes], search))
    // Sort by the ISO date from the workbook, not the localized DD/MM/YY display string.
    // Rows with no date naturally fall to the bottom rather than sorting as labels.
    .sort((a,b) => b.sortDate.localeCompare(a.sortDate) || b.id.localeCompare(a.id))
  return <AdminWorkbookLayout active="/admin/pagamenti" title="Pagamenti" description="Storico di importi pagati rilevati nelle schede cliente Excel; operazioni di registrazione, modifica e cancellazione disattivate." displayName={profile.display_name} email={user.email}>
    <section className="panel"><form action="/admin/pagamenti" method="get" className="form"><label>Cerca utente, causale o articolo<input type="search" name="search" defaultValue={search} placeholder="Cerca pagamenti…" /></label><button type="submit">Cerca</button></form></section>
    <section className="panel"><div className="section-heading"><h2>Righe pagamento ({rows.length})</h2></div><ReadOnlyTable columns={[{key:'date',label:'Data'},{key:'code',label:'Codice'},{key:'customer',label:'Utente'},{key:'type',label:'Movimento'},{key:'reference',label:'Riferimento'},{key:'amount',label:'Importo',align:'right'},{key:'notes',label:'Note'}]} rows={rows.slice(0,1000)} emptyLabel="Nessun importo pagato trovato nel workbook." />{rows.length>1000 && <p className="muted">Mostrate le prime 1.000 righe corrispondenti; restringi la ricerca per trovare il resto.</p>}</section>
  </AdminWorkbookLayout>
}
