import { notFound } from 'next/navigation'
import Link from 'next/link'
import AdminWorkbookLayout from '../../../../components/admin-workbook-layout'
import { getLatestExcelWorkbook, getWorkbookArticles, dateLabel, money } from '../../../../lib/excel-source'
import { requirePageContext } from '../../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export default async function ArticleReadOnlyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, profile } = await requirePageContext('AMMINISTRATORE')
  const { id } = await params
  const key = decodeURIComponent(id)
  const workbook = await getLatestExcelWorkbook()
  const article = getWorkbookArticles(workbook).find((item) => item.id === key || item.codeLabel === key || item.itemKey === key)
  if (!article) notFound()
  return <AdminWorkbookLayout active="/admin/articoli/archivio" title={article.detail || article.series} description={`Scheda derivata da ${article.sheet}, riga Excel ${article.excelRow}`} displayName={profile.display_name} email={user.email}>
    <section className="panel"><dl className="details-list"><dt>Chiave Excel</dt><dd>{article.codeLabel}</dd><dt>Foglio e riga</dt><dd>{article.sheet} · {article.excelRow}</dd><dt>Data</dt><dd>{dateLabel(article.date)}</dd><dt>Serie</dt><dd>{article.series}</dd><dt>Tipo</dt><dd>{article.type}</dd><dt>Dettaglio</dt><dd>{article.detail}</dd><dt>Quantità</dt><dd>{article.quantity}</dd><dt>Stato</dt><dd>{article.status}</dd><dt>Costo totale letto dal foglio</dt><dd>{article.totalCost != null ? money(article.totalCost) : '—'}</dd><dt>Valore in colonna SOLD (Excel)</dt><dd>{article.saleValue != null ? money(article.saleValue) : '—'}</dd><dt>Utenti indicati</dt><dd>{article.customerCodes.join(', ') || '—'}</dd></dl>{article.photoUrl && <p><a href={article.photoUrl} target="_blank" rel="noreferrer">Apri immagine originale ↗</a></p>}<Link className="back-button" href="/admin/articoli/archivio">← Torna all’archivio</Link></section>
  </AdminWorkbookLayout>
}
