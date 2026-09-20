import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'
import Navigation from '../../../../components/navigation'
import ArticleForm from '../../../../components/article-form'
import { createArticle } from '../actions'

export default async function NuovoArticoloPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const { data: customers } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email')
    .order('last_name')
    .order('first_name')

  return (
    <div className="app-shell">
      <Navigation role="AMMINISTRATORE" active="/admin/articoli/nuovo" displayName={profile.display_name} />
      <main className="main-content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">ARTICOLI</p>
            <h1>Nuovo articolo</h1>
            <p className="page-subtitle">Inserisci un nuovo articolo nell’archivio.</p>
          </div>
          <a className="back-button" href="/admin/articoli/archivio">Vai all’archivio articoli</a>
        </div>
        <section className="panel">
          <ArticleForm action={createArticle} customers={(customers || []) as any} />
        </section>
      </main>
    </div>
  )
}
