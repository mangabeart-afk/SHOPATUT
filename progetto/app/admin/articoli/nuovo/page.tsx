import { redirect } from 'next/navigation'
import { createClient } from '../../../../lib/supabase-server'
import Navigation from '../../../../components/navigation'
import ArticleForm from '../../../../components/article-form'
import { createArticle } from '../actions'

export default async function NuovoArticoloPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const params = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const [
    { data: mailboxes, error: mailboxesError },
    { data: customers, error: customersError },
  ] = await Promise.all([
    supabase
      .from('mailboxes')
      .select('id, mailbox_code, customer_id')
      .order('mailbox_code'),
    supabase
      .from('customers')
      .select('id, customer_code, first_name, last_name, email')
      .order('customer_code'),
  ])

  const mailboxByCustomerId = new Map(
    (mailboxes || [])
      .filter((mailbox: any) => mailbox.customer_id)
      .map((mailbox: any) => [mailbox.customer_id, mailbox]),
  )

  // La ricerca deve includere tutti i clienti, anche quelli per cui la casella
  // non è stata ancora creata. In quel caso si usa il codice cliente come fallback.
  const normalizedCustomers = (customers || []).map((customer: any) => {
    const mailbox = mailboxByCustomerId.get(customer.id)
    return {
      id: customer.id,
      first_name: customer.first_name || '',
      last_name: customer.last_name || '',
      email: customer.email || null,
      mailbox_code: mailbox?.mailbox_code || customer.customer_code || null,
      customer_code: customer.customer_code || mailbox?.mailbox_code || null,
    }
  })

  const customerLoadError = mailboxesError?.message || customersError?.message || ''

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
          {params.error ? <div className="error" role="alert" style={{ marginBottom: 12 }}>{params.error}</div> : null}
          {params.message ? <div className="success" role="status" style={{ marginBottom: 12 }}>{params.message}</div> : null}
          {customerLoadError ? <div className="error">Impossibile caricare l’elenco clienti: {customerLoadError}</div> : <ArticleForm action={createArticle} customers={normalizedCustomers as any} />}
        </section>
      </main>
    </div>
  )
}
