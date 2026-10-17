import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'
import IncomingArticlesGallery from '../../../components/incoming-articles-gallery'
import WhatsAppContact from '../../../components/whatsapp-contact'

type RecentPhotoArticle = {
  id: string
  article_code: string
  series: string | null
  detail: string | null
  origin: string | null
  photo_url: string | null
  created_at: string
  status: string | null
}

export default async function RecentPhotoArticlesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role === 'AMMINISTRATORE') redirect('/admin')

  const { data: rows, error } = await supabase.rpc('customer_dashboard_recent_photo_articles_120')
  const articles = ((rows || []) as RecentPhotoArticle[])
    .filter((article) => Boolean(article.photo_url?.trim()))
    .slice(0, 120)

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/dashboard" displayName={profile?.display_name} email={user.email} />
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AREA CLIENTE</p>
            <h1>Ultimi articoli inseriti</h1>
          </div>
          <WhatsAppContact />
        </header>

        <section className="panel recent-articles-page-panel">
          <div className="section-heading recent-articles-page-heading">
            <div>
              <h2>ARTICOLI CON FOTO</h2>
              <p className="muted">Gli ultimi 120 articoli inseriti, ordinati dal più recente. 12 articoli per pagina.</p>
            </div>
            <a href="/dashboard" className="back-button">← Torna alla dashboard</a>
          </div>

          {error ? (
            <div className="empty">Galleria temporaneamente non disponibile.</div>
          ) : articles.length === 0 ? (
            <div className="empty">Nessun articolo con foto disponibile.</div>
          ) : (
            <IncomingArticlesGallery articles={articles} paginated />
          )}
        </section>
      </section>
    </main>
  )
}
