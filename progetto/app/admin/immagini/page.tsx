import { redirect } from 'next/navigation'
import Navigation from '../../../components/navigation'
import { createClient } from '../../../lib/supabase-server'
import PhotoUrlSync from './photo-url-sync'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function AdminPhotoImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('role,display_name')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  return (
    <main className="shell">
      <Navigation role="AMMINISTRATORE" active="/admin/immagini" displayName={profile?.display_name} email={user.email} />
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">AMMINISTRAZIONE · EXCEL / SUPABASE</p>
            <h1>Sincronizza foto articoli</h1>
          </div>
          <a className="back-button" href="/admin/articoli/archivio">← Archivio articoli</a>
        </header>

        <section className="panel">
          <h2>1. Prepara il file Excel</h2>
          <p>Nel file <strong>MangaBEART_riconciliazione_Supabase.xlsx</strong>, inserisci l’intestazione <code>IMMAGINE_URL</code> nella riga 2 delle schede X, Y e Z, rispettivamente in Q2, U2 e Z2. Incolla sotto l’intestazione il link diretto alla foto di ogni articolo. Non inserire righe, non riordinare le schede e non cancellare le righe originali: il collegamento al database usa il nome della scheda e il numero della riga originale.</p>
          <p>Il collegamento deve essere un URL <code>https://</code> o <code>http://</code> accessibile dall’applicazione. Le celle vuote non modificano le foto esistenti.</p>
        </section>

        <section className="panel">
          <h2>2. Verifica e sincronizza</h2>
          <p>Carica il file Excel aggiornato. La prima operazione mostra un’anteprima senza scrivere nel database. Solo dopo aver controllato i conteggi potrai confermare l’importazione.</p>
          <PhotoUrlSync />
        </section>
      </section>
    </main>
  )
}
