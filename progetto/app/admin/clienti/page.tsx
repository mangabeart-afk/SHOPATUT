import Link from 'next/link'
import AdminWorkbookLayout from '../../../components/admin-workbook-layout'
import { getAllCustomerSheets, getLatestExcelWorkbook, money, searchText } from '../../../lib/excel-source'
import { requirePageContext } from '../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = { searchParams: Promise<{ search?: string; sort?: string }> }
const SORTS = ['name', 'surname', 'balance', 'last_order'] as const
function surnameForSort(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return name
  const last = parts[parts.length - 1]
  const previous = parts[parts.length - 2]
  return /^(DE|DI|DA|DEL|DELLA|DELLE|DEI|DEGLI|D')$/i.test(previous) ? `${previous} ${last}` : last
}
function lastOrderDate(customer: ReturnType<typeof getAllCustomerSheets>[number]) {
  return customer.items.map((item) => item.date || '').filter(Boolean).sort().at(-1) || ''
}

export default async function UtentiAdminPage({ searchParams }: PageProps) {
  const { user, profile } = await requirePageContext('AMMINISTRATORE')
  const params = await searchParams
  const search = (params.search || '').trim()
  const sort = (SORTS as readonly string[]).includes(params.sort || '') ? params.sort as typeof SORTS[number] : 'name'
  const workbook = await getLatestExcelWorkbook()
  const customers = getAllCustomerSheets(workbook).filter((customer) => searchText([customer.code, customer.name, customer.contact], search))
  customers.sort((a, b) => {
    if (sort === 'balance') return b.balance - a.balance || a.name.localeCompare(b.name, 'it')
    if (sort === 'last_order') return lastOrderDate(b).localeCompare(lastOrderDate(a)) || a.name.localeCompare(b.name, 'it')
    if (sort === 'surname') return surnameForSort(a.name).localeCompare(surnameForSort(b.name), 'it', { sensitivity: 'base' }) || a.name.localeCompare(b.name, 'it')
    return a.name.localeCompare(b.name, 'it', { sensitivity: 'base' })
  })

  return <AdminWorkbookLayout active="/admin/clienti" title="Utenti" description="Elenco a schede ricavato dalle schede cliente del workbook Excel. Apertura scheda in sola lettura." displayName={profile.display_name} email={user.email}>
    <section className="panel customer-search-panel">
      <h2>Ricerca e ordinamento utenti</h2>
      <form action="/admin/clienti" method="get" className="form">
        <label>Cerca codice, nome o cognome<input type="search" name="search" defaultValue={search} placeholder="Codice utente, nome o cognome…" /></label>
        <label>Ordina utenti per<select name="sort" defaultValue={sort}><option value="name">Nome</option><option value="surname">Cognome</option><option value="balance">Saldo</option><option value="last_order">Data ultimo ordine</option></select></label>
        <button type="submit">Applica</button>
        {(search || sort !== 'name') && <Link href="/admin/clienti" className="back-button">Azzera filtri</Link>}
      </form>
    </section>
    <section className="panel customer-situation-panel">
      <div className="section-heading"><h2>{search ? 'Risultati ricerca' : 'Elenco utenti'} ({customers.length})</h2></div>
      {customers.length === 0 ? <div className="empty">Nessun utente trovato.</div> : (
        <div className="customer-search-results" aria-label="Elenco completo utenti">
          {customers.map((customer) => (
            <Link className="customer-situation-row" href={`/admin/clienti/${encodeURIComponent(customer.code)}`} key={customer.code}>
              <div className="customer-situation-row-heading">
                <strong>{customer.name}</strong>
                <b>{customer.code}</b>
              </div>
              <div className="customer-situation-row-metrics">
                <span className="situation-metric balance"><small>Saldo</small><strong>{money(customer.balance)}</strong></span>
                <span className="situation-metric incoming"><small>IN ARRIVO</small><strong>{customer.incomingUnits}</strong></span>
                <span className="situation-metric stock"><small>IN STOCK</small><strong>{customer.stockUnits}</strong></span>
                <span className="situation-metric box"><small>IN BOX</small><strong>{customer.boxUnits}</strong></span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  </AdminWorkbookLayout>
}
