import { redirect } from 'next/navigation'
import { createClient } from '../../../lib/supabase-server'
import Navigation from '../../../components/navigation'

type CasellePageProps = {
  searchParams: Promise<{ search?: string; message?: string; error?: string }>
}

const formatDate = (value: string | null) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

async function createMailbox(formData: FormData) {
  'use server'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const firstName = String(formData.get('first_name') || '').trim()
  const lastName = String(formData.get('last_name') || '').trim()
  const phone = String(formData.get('phone') || '').trim()
  const email = String(formData.get('email') || '').trim()
  const status = String(formData.get('status') || 'ATTIVA').trim()
  const openedAt = String(formData.get('opened_at') || new Date().toISOString().slice(0, 10))
  const notes = String(formData.get('notes') || '').trim()

  if (!firstName || !lastName) redirect('/admin/caselle?error=Nome e cognome sono obbligatori.')

  const { error } = await supabase.rpc('admin_create_customer_mailbox', {
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone: phone || null,
    p_email: email || null,
    p_status: status,
    p_opened_at: openedAt,
    p_notes: notes || null,
  })

  if (error) redirect(`/admin/caselle?error=${encodeURIComponent(error.message)}`)
  redirect('/admin/caselle?message=Cliente e casella creati correttamente.')
}

export default async function CaselleAdminPage({ searchParams }: CasellePageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,display_name').eq('user_id', user.id).maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const params = await searchParams
  const search = params.search?.trim() || ''
  const message = params.message?.trim() || ''
  const errorMessage = params.error?.trim() || ''

  const { data: mailboxes, error } = await supabase.from('mailboxes').select(`
    id, mailbox_code, customer_id, status, opened_at, notes, created_at,
    customers (first_name, last_name, email, phone, customer_code)
  `).order('mailbox_code', { ascending: true })

  if (error) {
    return <main className="shell"><Navigation role="AMMINISTRATORE" active="/admin/caselle" displayName={profile?.display_name} email={user.email} /><section className="content"><header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Caselle</h1></div></header><section className="panel"><div className="error">Impossibile caricare le caselle: {error.message}</div></section></section></main>
  }

  const rows = (mailboxes || []).filter((mailbox: any) => {
    if (!search) return true
    const customer = Array.isArray(mailbox.customers) ? mailbox.customers[0] : mailbox.customers
    return [mailbox.mailbox_code, mailbox.status, customer?.customer_code, customer?.first_name, customer?.last_name, customer?.email, customer?.phone].filter(Boolean).join(' ').toLowerCase().includes(search.toLowerCase())
  })

  return (
    <main className="shell">
      <Navigation role="AMMINISTRATORE" active="/admin/caselle" displayName={profile?.display_name} email={user.email} />
      <section className="content">
        <header className="topbar"><div><p className="eyebrow">AMMINISTRAZIONE</p><h1>Caselle</h1></div></header>
        {message && <section className="panel"><div className="success">{decodeURIComponent(message)}</div></section>}
        {errorMessage && <section className="panel"><div className="error">{decodeURIComponent(errorMessage)}</div></section>}

        <section className="panel">
          <h2>Crea nuova casella</h2>
          <p className="muted">Inserisci direttamente i dati del cliente. Il codice cliente e il codice casella vengono generati automaticamente.</p>
          <form action={createMailbox} className="article-create-form">
            <div className="form-grid">
              <label>Nome<input type="text" name="first_name" required autoComplete="given-name" /></label>
              <label>Cognome<input type="text" name="last_name" required autoComplete="family-name" /></label>
              <label>Numero di telefono<input type="tel" name="phone" autoComplete="tel" /></label>
              <label>Email<input type="email" name="email" autoComplete="email" /></label>
              <label>Stato<select name="status" defaultValue="ATTIVA"><option value="ATTIVA">ATTIVA</option><option value="SOSPESA">SOSPESA</option><option value="CHIUSA">CHIUSA</option></select></label>
              <label>Data apertura<input type="date" name="opened_at" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
              <label className="form-grid-wide">Note<textarea name="notes" rows={3} placeholder="Note opzionali" /></label>
            </div>
            <button type="submit">Crea cliente e casella</button>
          </form>
        </section>

        <section className="panel">
          <h2>Ricerca caselle</h2>
          <form action="/admin/caselle" method="get" className="form">
            <label>Cerca casella o cliente<input type="search" name="search" defaultValue={search} placeholder="Codice, nome, cognome, email, telefono, stato..." /></label>
            <button type="submit">Cerca</button>
            {search && <a href="/admin/caselle" className="back-button">Azzera ricerca</a>}
          </form>
        </section>

        <section className="panel">
          <h2>{search ? `Risultati per "${search}"` : 'Elenco caselle'}</h2>
          {rows.length === 0 ? <div className="empty">{search ? 'Nessuna casella trovata.' : 'Nessuna casella registrata.'}</div> : <div className="movement-list">{rows.map((mailbox: any) => {
            const customer = Array.isArray(mailbox.customers) ? mailbox.customers[0] : mailbox.customers
            return <div className="movement" key={mailbox.id}>
              <div><b>{mailbox.mailbox_code}</b><span>Cliente: {customer ? `${customer.first_name} ${customer.last_name}` : 'Non trovato'}</span>{customer?.customer_code && <span>Codice cliente: {customer.customer_code}</span>}{customer?.email && <span>Email: {customer.email}</span>}{customer?.phone && <span>Telefono: {customer.phone}</span>}<span>Apertura: {formatDate(mailbox.opened_at)}</span>{mailbox.notes && <span>Note: {mailbox.notes}</span>}</div>
              <div><span>Stato: <strong>{mailbox.status}</strong></span><span>Creata: {formatDate(mailbox.created_at)}</span></div>
            </div>
          })}</div>}
        </section>
      </section>
    </main>
  )
}
