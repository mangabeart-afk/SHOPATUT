import { redirect } from 'next/navigation'
import Navigation from '../../../components/navigation'
import IncomingArticlesGallery from '../../../components/incoming-articles-gallery'
import WhatsAppContact from '../../../components/whatsapp-contact'
import ReadOnlyNotice from '../../../components/read-only-notice'
import { getLatestExcelWorkbook, getWorkbookArticles, dateLabel } from '../../../lib/excel-source'
import { requirePageContext } from '../../../lib/page-context'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function RecentArticlesPage() {
  const { user, profile } = await requirePageContext()
  if (profile.role === 'AMMINISTRATORE') redirect('/admin/articoli/archivio')
  const workbook = await getLatestExcelWorkbook()
  const recent = getWorkbookArticles(workbook).filter((item) => item.photoUrl)
    .sort((a,b) => (b.date || '').localeCompare(a.date || '') || b.excelRow - a.excelRow)
    .slice(0, 60)
  const cards = recent.map((item) => ({ id:item.id, series:item.series, detail:`${item.detail}${item.date ? ` · ${dateLabel(item.date)}` : ''}`, photo_url:item.photoUrl, status:item.status, origin:item.origin }))
  return <main className="shell"><Navigation role="CLIENTE" active="/dashboard/ultimi-articoli" displayName={profile.display_name} email={user.email} /><section className="content">
    <header className="topbar"><div><p className="eyebrow">AREA UTENTE</p><h1>Ultimi articoli</h1><p className="muted">Foto e dettagli ordinati per data nel workbook Excel.</p></div><WhatsAppContact /></header>
    <section className="panel"><IncomingArticlesGallery articles={cards} /><ReadOnlyNotice /></section>
  </section></main>
}
