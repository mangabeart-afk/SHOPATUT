import AdminWorkbookLayout from '../../../components/admin-workbook-layout'
import ReadOnlyTable from '../../../components/read-only-table'
import { getAllCustomerSheets, getLatestExcelWorkbook, dateLabel, money, searchText } from '../../../lib/excel-source'
import { requirePageContext } from '../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function AdminSpedizioniPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { user, profile } = await requirePageContext('AMMINISTRATORE')
  const { search = '' } = await searchParams
  const workbook = await getLatestExcelWorkbook()
  const rows = getAllCustomerSheets(workbook).flatMap((customer) => customer.items.filter((item) => item.status === 'SPEDITO').map((item) => ({
    id: item.id,
    code: customer.code,
    customer: customer.name,
    // Keep the ISO date for sorting; use the Italian formatted date only for display.
    dateValue: item.date || '',
    date: dateLabel(item.date),
    article: item.article,
    movement: item.movement || 'Ordine',
    quantity: String(item.quantity),
    amount: item.amount != null ? money(item.amount) : '—',
  })))
    .filter((item) => searchText([item.code,item.customer,item.date,item.article,item.movement], search))
    .sort((a,b) => b.dateValue.localeCompare(a.dateValue) || b.id.localeCompare(a.id))
  return <AdminWorkbookLayout active="/admin/spedizioni" title="Spedizioni" description="Articoli con stato SPEDITO nelle schede cliente. Creazione, annullamento e modifica spedizioni sono disattivati." displayName={profile.display_name} email={user.email}>
    <section className="panel"><form action="/admin/spedizioni" method="get" className="form"><label>Cerca utente o articolo<input type="search" name="search" defaultValue={search} placeholder="Cerca spedizioni…" /></label><button type="submit">Cerca</button></form></section>
    <section className="panel"><h2>Righe SPEDITO ({rows.length})</h2><ReadOnlyTable columns={[{key:'date',label:'Data'},{key:'code',label:'Codice'},{key:'customer',label:'Utente'},{key:'article',label:'Articolo'},{key:'movement',label:'Movimento'},{key:'quantity',label:'Q.tà',align:'right'},{key:'amount',label:'Importo',align:'right'}]} rows={rows.slice(0,1000)} emptyLabel="Nessun articolo SPEDITO nel workbook." />{rows.length>1000 && <p className="muted">Mostrate le prime 1.000 righe, usa la ricerca per restringere l'elenco.</p>}</section>
  </AdminWorkbookLayout>
}
