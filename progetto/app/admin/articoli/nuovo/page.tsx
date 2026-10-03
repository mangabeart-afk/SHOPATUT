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

  const { data: mailboxes, error: mailboxesError } = await supabase
    .from('mailboxes')
    .select('id, mailbox_code, customer_id, customers(first_name,last_name,email,customer_code)')
    .order('mailbox_code')

  const normalizedCustomers = (mailboxes || []).map((mailbox: any) => {
    const customer = Array.isArray(mailbox.customers) ? mailbox.customers[0] : mailbox.customers
    return {
      id: mailbox.customer_id || mailbox.id,
      first_name: customer?.first_name || '',
      last_name: customer?.last_name || '',
      email: customer?.email || null,
      mailbox_code: mailbox.mailbox_code || null,
      customer_code: customer?.customer_code || null,
    }
  })

  const customerLoadError = mailboxesError?.message || ''

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
          {customerLoadError ? <div className="error">Impossibile caricare l’elenco clienti: {customerLoadError}</div> : <ArticleForm action={createArticle} customers={normalizedCustomers as any} />}
        </section>
      </main>
    </div>
  )
}
