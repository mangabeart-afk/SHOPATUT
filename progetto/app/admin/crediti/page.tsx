import AdminWorkbookLayout from '../../../components/admin-workbook-layout'
import ReadOnlyTable from '../../../components/read-only-table'
import { getAllCustomerSheets, getLatestExcelWorkbook, dateLabel, money, searchText } from '../../../lib/excel-source'
import { requirePageContext } from '../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const correctionPattern = /CASHBACK|CREDITO|RIMBORSO/i

export default async function AdminCreditiPage({ searchParams }: { searchParams: Promise<{ search?: string }> }) {
  const { user, profile } = await requirePageContext('AMMINISTRATORE')
  const { search = '' } = await searchParams
  const workbook = await getLatestExcelWorkbook()

  // Excel non ha un registro separato dei crediti: identifica rettifiche sia
  // nella colonna MOVIMENTO sia nella colonna ARTICOLO/RIFERIMENTO. Le righe
  // con importo acquisto negativo restano incluse anche se la causale non c'e'.
  const rows = getAllCustomerSheets(workbook)
    .flatMap((customer) => customer.transactions
      .filter((item) => correctionPattern.test(item.movement) || correctionPattern.test(item.article) || (item.amount != null && item.amount < 0))
      .map((item) => ({
        id: item.id,
        code: customer.code,
        customer: customer.name,
        date: dateLabel(item.date),
        movement: item.movement || 'Rettifica',
        reference: item.article || '—',
        amount: item.amount != null ? money(item.amount) : '—',
        paid: item.amountPaid != null ? money(item.amountPaid) : '—',
      })))
    .filter((item) => searchText([item.code, item.customer, item.date, item.movement, item.reference], search))
    .sort((a, b) => {
      // Le date vengono ordinate cronologicamente prima di essere rese leggibili.
      const dateA = a.date === '—' ? '' : a.date.split('/').reverse().join('-')
      const dateB = b.date === '—' ? '' : b.date.split('/').reverse().join('-')
      return dateB.localeCompare(dateA) || b.id.localeCompare(a.id)
    })

  return <AdminWorkbookLayout active="/admin/crediti" title="Crediti e rettifiche" description="L’Excel non contiene un registro separato di crediti residui; qui sono elencate le rettifiche esplicite trovate nei fogli cliente." displayName={profile.display_name} email={user.email}>
    <section className="panel"><form action="/admin/crediti" method="get" className="form"><label>Cerca utente o rettifica<input type="search" name="search" defaultValue={search} placeholder="Cerca crediti…" /></label><button type="submit">Cerca</button></form></section>
    <section className="panel"><h2>Rettifiche ({rows.length})</h2><ReadOnlyTable columns={[{key:'date',label:'Data'},{key:'code',label:'Codice'},{key:'customer',label:'Utente'},{key:'movement',label:'Tipo'},{key:'reference',label:'Riferimento'},{key:'amount',label:'Importo',align:'right'},{key:'paid',label:'Pagato',align:'right'}]} rows={rows.slice(0,1000)} emptyLabel="Nessuna rettifica esplicita trovata nel workbook." /></section>
  </AdminWorkbookLayout>
}
