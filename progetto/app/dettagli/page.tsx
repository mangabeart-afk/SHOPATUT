import { redirect } from 'next/navigation'
import { createClient } from '../../lib/supabase-server'
import Navigation from '../../components/navigation'
import WhatsAppContact from '../../components/whatsapp-contact'
import ShippingAddressForm from '../../components/shipping-address-form'

const formatDate = (value: string | null) => {
  if (!value) return '—'
  return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))
}

export default async function MyDetailsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,display_name,customer_id,mailbox_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profile?.role === 'AMMINISTRATORE') redirect('/admin')

  let customerId = profile?.customer_id || null
  if (!customerId && profile?.mailbox_id) {
    const { data: mailbox } = await supabase.from('mailboxes').select('customer_id').eq('id', profile.mailbox_id).maybeSingle()
    customerId = mailbox?.customer_id || null
  }

  const { data: customer } = customerId
    ? await supabase.from('customers').select('customer_code,first_name,last_name,email,phone,shipping_address,shipping_postal_code,shipping_city,shipping_country,created_at').eq('id', customerId).maybeSingle()
    : { data: null }

  return (
    <main className="shell">
      <Navigation role="CLIENTE" active="/dettagli" displayName={profile?.display_name} email={user.email} />
      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">AREA UTENTE</p><h1>I miei dettagli</h1></div>
          <WhatsAppContact />
        </header>
        {!customer ? (
          <section className="panel"><div className="empty">I dati del profilo non sono disponibili. Contatta l’amministrazione.</div></section>
        ) : (
          <>
            <section className="panel my-details-panel">
              <h2>Profilo utente</h2>
              <div className="my-details-grid">
                <div><span>Codice utente</span><strong>{customer.customer_code || '—'}</strong></div>
                <div><span>Nome</span><strong>{customer.first_name || '—'}</strong></div>
                <div><span>Cognome</span><strong>{customer.last_name || '—'}</strong></div>
                <div><span>Email</span><strong>{customer.email || user.email || '—'}</strong></div>
                <div><span>Cellulare</span><strong>{customer.phone || '—'}</strong></div>
                <div><span>Utente dal</span><strong>{formatDate(customer.created_at)}</strong></div>
              </div>
            </section>
            <ShippingAddressForm
              initialAddress={customer.shipping_address}
              initialPostalCode={customer.shipping_postal_code}
              initialCity={customer.shipping_city}
              initialCountry={customer.shipping_country}
            />
          </>
        )}
      </section>
    </main>
  )
}
