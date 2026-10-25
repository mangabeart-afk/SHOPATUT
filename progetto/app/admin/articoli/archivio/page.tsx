import Link from 'next/link'
import AdminWorkbookLayout from '../../../../components/admin-workbook-layout'
import ExcelArchiveTable from './ExcelArchiveTable'
import { getLatestExcelWorkbook, getWorkbookArticles, money, dateLabel, searchText } from '../../../../lib/excel-source'
import { requirePageContext } from '../../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Props = { searchParams: Promise<{ search?: string; status?: string; sheet?: string; page?: string; sort?: string }> }
const PAGE_SIZE = 100
const SORTS = ['date_asc','date_desc','code_asc','code_desc','series_asc','series_desc','detail_asc','detail_desc','quantity_asc','quantity_desc','available_asc','available_desc','total_cost_asc','total_cost_desc','unit_cost_asc','unit_cost_desc','status_asc','status_desc','users_asc','users_desc'] as const

type SortKey = typeof SORTS[number]
function textCompare(a: string, b: string) { return a.localeCompare(b, 'it', { numeric: true, sensitivity: 'base' }) }
function numberCompare(a: number | null, b: number | null) { return (a ?? -Infinity) - (b ?? -Infinity) }

export default async function ArticoliAdminPage({ searchParams }: Props) {
  const { user, profile } = await requirePageContext('AMMINISTRATORE')
  const params = await searchParams
  const search = (params.search || '').trim()
  const status = (params.status || '').trim().toUpperCase()
  const source = (params.sheet || '').trim().toUpperCase()
  const sort = (SORTS as readonly string[]).includes(params.sort || '') ? params.sort as SortKey : 'date_desc'
  const workbook = await getLatestExcelWorkbook()
  const all = getWorkbookArticles(workbook)
  const filtered = all.filter((item) => (!status || item.status === status) && (!source || item.sheet.toUpperCase() === source) && searchText([item.codeLabel,item.itemKey,item.series,item.type,item.detail,item.status,item.origin,...item.customerCodes,item.sheet], search))
  const compareBySort = (a: typeof filtered[number], b: typeof filtered[number]) => {
    let result = 0
    switch (sort) {
      case 'date_asc': result = textCompare(a.date || '', b.date || ''); break
      case 'date_desc': result = textCompare(b.date || '', a.date || ''); break
      case 'code_asc': result = textCompare(a.codeLabel, b.codeLabel); break
      case 'code_desc': result = textCompare(b.codeLabel, a.codeLabel); break
      case 'series_asc': result = textCompare(a.series, b.series); break
      case 'series_desc': result = textCompare(b.series, a.series); break
      case 'detail_asc': result = textCompare(a.detail, b.detail); break
      case 'detail_desc': result = textCompare(b.detail, a.detail); break
      case 'quantity_asc': result = a.quantity - b.quantity; break
      case 'quantity_desc': result = b.quantity - a.quantity; break
      case 'available_asc': result = a.available - b.available; break
      case 'available_desc': result = b.available - a.available; break
      case 'total_cost_asc': result = numberCompare(a.totalCost, b.totalCost); break
      case 'total_cost_desc': result = numberCompare(b.totalCost, a.totalCost); break
      case 'unit_cost_asc': result = numberCompare(a.unitCost, b.unitCost); break
      case 'unit_cost_desc': result = numberCompare(b.unitCost, a.unitCost); break
      case 'status_asc': result = textCompare(a.status, b.status); break
      case 'status_desc': result = textCompare(b.status, a.status); break
      case 'users_asc': result = a.customerCodes.length - b.customerCodes.length; break
      case 'users_desc': result = b.customerCodes.length - a.customerCodes.length; break
    }
    return result || textCompare(a.id, b.id)
  }
  filtered.sort(compareBySort)
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number.parseInt(params.page || '1', 10) || 1))
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const currentFilters = { ...(search ? { search } : {}), ...(status ? { status } : {}), ...(source ? { sheet: source } : {}), sort }
  const pageHref = (target: number) => `/admin/articoli/archivio?${new URLSearchParams({ ...currentFilters, page: String(target) }).toString()}`
  const headerSortLink = (key: string) => {
    const asc = `${key}_asc`, desc = `${key}_desc`
    const target = sort === asc ? desc : sort === desc ? asc : key === 'date' ? 'date_desc' : key === 'code' ? 'code_desc' : key === 'quantity' || key === 'available' || key === 'total_cost' || key === 'unit_cost' || key === 'users' ? desc : asc
    return `/admin/articoli/archivio?${new URLSearchParams({ ...(search ? { search } : {}), ...(status ? { status } : {}), ...(source ? { sheet: source } : {}), sort: target }).toString()}`
  }
  const sortLinks = Object.fromEntries(['date','code','series','detail','quantity','available','total_cost','unit_cost','status','users'].map((key) => [key, headerSortLink(key)]))
  const rows = paged.map((item) => ({
    id: item.id,
    key: item.codeLabel,
    source: `${item.sheet} · riga ${item.excelRow}`,
    date: dateLabel(item.date),
    rawDate: item.date || '',
    series: item.series,
    type: item.type,
    detail: item.detail,
    qty: item.quantity,
    available: item.available,
    total: item.totalCost != null ? money(item.totalCost) : '—',
    unit: item.unitCost != null ? money(item.unitCost) : '—',
    sold: item.saleValue != null ? money(item.saleValue) : '—',
    status: item.status,
    customers: item.customerCodes,
    photoUrl: item.photoUrl,
    origin: item.origin,
  }))

  return <AdminWorkbookLayout active="/admin/articoli/archivio" title="Archivio articoli" description="Archivio Excel in sola lettura · X, Y, Z e VIET. Il codice apre i dettagli completi; l'icona foto apre l'immagine originale." displayName={profile.display_name} email={user.email}>
    <section className="panel"><form action="/admin/articoli/archivio" method="get" className="form excel-archive-filters">
      <label>Cerca codice, serie, descrizione o utente<input type="search" name="search" defaultValue={search} placeholder="Cerca nell'archivio…" /></label>
      <label>Stato<select name="status" defaultValue={status}><option value="">Tutti gli stati</option><option value="IN ARRIVO">IN ARRIVO</option><option value="IN STOCK">IN STOCK</option><option value="VENDUTO">VENDUTO</option><option value="SPEDITO">SPEDITO</option></select></label>
      <label>Foglio<select name="sheet" defaultValue={source}><option value="">Tutti i fogli</option><option value="X">X</option><option value="Y">Y</option><option value="Z">Z</option><option value="VIET">VIET</option></select></label>
      <input type="hidden" name="sort" value={sort} />
      <button type="submit">Filtra</button>{(search || status || source) && <Link href="/admin/articoli/archivio" className="back-button">Azzera</Link>}
    </form></section>
    <section className="panel"><div className="section-heading"><h2>Articoli ({filtered.length})</h2><span className="muted">Pagina {page} di {pages} · massimo {PAGE_SIZE} righe</span></div>
      <p className="muted excel-archive-legend">Q = quantità totale · S = quantità residua stimata usando il conteggio venduto presente nel workbook. I valori sono consultivi e non modificano Excel.</p>
      <ExcelArchiveTable rows={rows} resultCount={filtered.length} sort={sort} sortLinks={sortLinks} />
      {pages > 1 && <nav className="server-archive-pagination" aria-label="Paginazione archivio"><Link className="filter-submit" aria-disabled={page <= 1} href={pageHref(Math.max(1,page-1))}>‹ Precedente</Link><span>Pagina {page} di {pages}</span><Link className="filter-submit" aria-disabled={page >= pages} href={pageHref(Math.min(pages,page+1))}>Successiva ›</Link></nav>}
    </section>
  </AdminWorkbookLayout>
}
