import AdminWorkbookLayout from '../../../components/admin-workbook-layout'
import ReadOnlyTable from '../../../components/read-only-table'
import { getAllCustomerSheets, getLatestExcelWorkbook, dateLabel, money, searchText } from '../../../lib/excel-source'
import { requirePageContext } from '../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function AdminMovimentiPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { user, profile } = await requirePageContext('AMMINISTRATORE')
  const { search = '' } = await searchParams
  const workbook = await getLatestExcelWorkbook()
  const rows = getAllCustomerSheets(workbook).flatMap((customer) => customer.transactions.map((item) => ({ id:item.id,code:customer.code,customer:customer.name,date:dateLabel(item.date),movement:item.movement||'—',article:item.article||'—',quantity:item.quantity?String(item.quantity):'—',amount:item.amount!=null?money(item.amount):'—',paid:item.amountPaid!=null?money(item.amountPaid):'—',status:item.status||'—' })))
    .filter((item) => searchText([item.code,item.customer,item.date,item.movement,item.article,item.status], search))
    .sort((a,b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
  return <AdminWorkbookLayout active="/admin/movimenti" title="Movimenti" description="Righe di movimento e ordini estratte dalle schede cliente del workbook." displayName={profile.display_name} email={user.email}>
    <section className="panel"><form action="/admin/movimenti" method="get" className="form"><label>Cerca codice, nome, movimento o articolo<input type="search" name="search" defaultValue={search} placeholder="Cerca movimenti…" /></label><button type="submit">Cerca</button></form></section>
    <section className="panel"><div className="section-heading"><h2>Movimenti ({rows.length})</h2></div><ReadOnlyTable columns={[{key:'date',label:'Data'},{key:'code',label:'Codice'},{key:'customer',label:'Utente'},{key:'movement',label:'Movimento'},{key:'article',label:'Articolo'},{key:'quantity',label:'Q.tà',align:'right'},{key:'amount',label:'Importo',align:'right'},{key:'paid',label:'Pagato',align:'right'},{key:'status',label:'Stato'}]} rows={rows.slice(0,1000)} />{rows.length>1000 && <p className="muted">Mostrate le prime 1.000 righe; restringi la ricerca per consultare le altre.</p>}</section>
  </AdminWorkbookLayout>
}
