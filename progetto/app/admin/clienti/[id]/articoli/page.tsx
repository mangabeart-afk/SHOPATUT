import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '../../../../../lib/supabase-server'
import Navigation from '../../../../../components/navigation'
import CustomerArticlesList, {
  type CustomerArticleListRow,
} from '../../../../../components/customer-articles-list'

const money = (v: number) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
  }).format(Number(v || 0))

async function updateSale(formData: FormData) {
  'use server'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const movementId = String(formData.get('movement_id') || '')
  const movementDate = String(formData.get('movement_date') || '')
  const quantity = Number(formData.get('quantity') || 0)
  const unitPrice = Number(formData.get('unit_price_eur') || 0)
  const notes = String(formData.get('notes') || '')

  const { error } = await supabase.rpc('admin_update_customer_sale', {
    p_movement_id: movementId,
    p_movement_date: movementDate,
    p_quantity: quantity,
    p_unit_price_eur: unitPrice,
    p_notes: notes,
  })

  if (error) redirect(`?error=${encodeURIComponent(error.message)}`)

  redirect('?message=Acquisto modificato correttamente.')
}

async function deleteSale(formData: FormData) {
  'use server'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const movementId = String(formData.get('movement_id') || '')

  const { error } = await supabase.rpc('admin_delete_customer_sale', {
    p_movement_id: movementId,
  })

  if (error) redirect(`?error=${encodeURIComponent(error.message)}`)

  redirect('?message=Vendita annullata. Saldo e giacenza aggiornati.')
}

async function markInBox(formData: FormData) {
  'use server'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const assignmentIds = formData
    .getAll('assignment_id')
    .map(String)
    .filter(Boolean)

  if (assignmentIds.length === 0) {
    redirect('?error=Nessun articolo selezionato per IN BOX.')
  }

  const { data: updatedCount, error } = await supabase.rpc(
    'admin_mark_customer_articles_in_box',
    {
      p_assignment_ids: assignmentIds,
    },
  )

  if (error) {
    redirect(`?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath(`/admin/clienti/${String(formData.get('customer_id') || '')}/articoli`)

  redirect(
    `?message=${encodeURIComponent(
      `${Number(updatedCount || 0)} articolo/i impostato/i IN BOX.`,
    )}`,
  )
}

export default async function CustomerArticles({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ message?: string; error?: string }>
}) {
  const { id } = await params
  const query = searchParams ? await searchParams : {}
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,display_name')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.role !== 'AMMINISTRATORE') redirect('/dashboard')

  const { data: customer } = await supabase
    .from('customers')
    .select('id,customer_code,first_name,last_name')
    .eq('id', id)
    .maybeSingle()

  if (!customer) notFound()

  const { data: mailbox } = await supabase
    .from('mailboxes')
    .select('id')
    .eq('customer_id', id)
    .maybeSingle()

  if (!mailbox) notFound()

  const { data: sales, error: salesError } = await supabase
    .from('movements')
    .select(
      'id,article_id,quantity,unit_price_eur,total_amount_eur,movement_at,notes,reference_code,articles(article_code,series,detail,origin,status,quantity_purchased)',
    )
    .eq('mailbox_id', mailbox.id)
    .eq('movement_type', 'VENDITA')
    .order('movement_at', { ascending: false })

  if (salesError) {
    return (
      <main className="shell">
        <Navigation
          role="AMMINISTRATORE"
          active="/admin/clienti"
          displayName={profile?.display_name}
          email={user.email}
        />
        <section className="content">
          <section className="panel">
            <div className="error">Impossibile caricare gli articoli: {salesError.message}</div>
          </section>
        </section>
      </main>
    )
  }

  const saleRows = sales || []
  const saleIds = saleRows.map((sale) => sale.id)

  const [{ data: allocations }, { data: assignmentRows, error: assignmentsError }, { data: shipmentItemRows }] =
    await Promise.all([
      saleIds.length
        ? supabase
            .from('payment_allocations')
            .select('movement_id,amount_eur')
            .in('movement_id', saleIds)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('article_assignments')
        .select('id,article_id,quantity_assigned,status,assigned_at,notes')
        .eq('mailbox_id', mailbox.id)
        .in('status', ['ATTIVA', 'IN_BOX'])
        .order('assigned_at', { ascending: true }),
      supabase
        .from('shipment_items')
        .select('article_id,quantity_shipped,shipment_id,shipments(status)')
        .eq('mailbox_id', mailbox.id),
    ])

  if (assignmentsError) {
    return (
      <main className="shell">
        <Navigation
          role="AMMINISTRATORE"
          active="/admin/clienti"
          displayName={profile?.display_name}
          email={user.email}
        />
        <section className="content">
          <section className="panel">
            <div className="error">Impossibile caricare gli stati degli articoli: {assignmentsError.message}</div>
          </section>
        </section>
      </main>
    )
  }

  const paidBySale = new Map<string, number>()
  for (const allocation of allocations || []) {
    paidBySale.set(
      allocation.movement_id,
      (paidBySale.get(allocation.movement_id) || 0) + Number(allocation.amount_eur || 0),
    )
  }

  const assignmentByArticle = new Map<
    string,
    {
      id: string
      status: string
      quantity_assigned: number
    }
  >()

  for (const assignment of assignmentRows || []) {
    const articleId = assignment.article_id
    if (!articleId) continue

    const current = assignmentByArticle.get(articleId)
    if (
      !current ||
      (assignment.status === 'IN_BOX' && current.status !== 'IN_BOX')
    ) {
      assignmentByArticle.set(articleId, {
        id: assignment.id,
        status: assignment.status || 'ATTIVA',
        quantity_assigned: Number(assignment.quantity_assigned || 0),
      })
    }
  }

  const shippedByArticle = new Map<string, number>()
  for (const item of shipmentItemRows || []) {
    if (!item.article_id) continue
    const shipment = Array.isArray((item as any).shipments)
      ? (item as any).shipments[0]
      : (item as any).shipments
    if (shipment?.status === 'ANNULLATA') continue

    shippedByArticle.set(
      item.article_id,
      (shippedByArticle.get(item.article_id) || 0) +
        Number(item.quantity_shipped || 0),
    )
  }

  const rows: CustomerArticleListRow[] = saleRows.map((sale: any) => {
    const article = Array.isArray(sale.articles)
      ? sale.articles[0]
      : sale.articles

    const assignment = assignmentByArticle.get(sale.article_id)
    const shippedQuantity = sale.article_id
      ? shippedByArticle.get(sale.article_id) || 0
      : 0

    return {
      id: sale.id,
      assignment_id: assignment?.id || null,
      article_code: article?.article_code || sale.reference_code || 'Articolo',
      series: article?.series || null,
      detail: article?.detail || null,
      origin: article?.origin || null,
      date: sale.movement_at?.slice(0, 10) || '',
      quantity: Number(sale.quantity || 0),
      unit_price_eur: Number(sale.unit_price_eur || 0),
      total: Number(sale.total_amount_eur || 0),
      paid: paidBySale.get(sale.id) || 0,
      residual: Math.max(
        0,
        Number(sale.total_amount_eur || 0) -
          (paidBySale.get(sale.id) || 0),
      ),
      notes: sale.notes || null,
      article_arrival_status:
        article?.status === 'IN_ARRIVO' ? 'IN ARRIVO' : 'IN STOCK',
      article_global_status: article?.status || '—',
      assignment_status: assignment?.status || null,
      shipped_quantity: shippedQuantity,
    }
  })

  const totalResidual = rows.reduce((sum, row) => sum + row.residual, 0)

  return (
    <main className="shell">
      <Navigation
        role="AMMINISTRATORE"
        active="/admin/clienti"
        displayName={profile?.display_name}
        email={user.email}
      />

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">CLIENTE · {customer.customer_code || '—'}</p>
            <h1>
              Articoli acquistati da {customer.first_name} {customer.last_name}
            </h1>
          </div>

          <a className="back-button" href={`/admin/clienti/${id}`}>
            ← Scheda cliente
          </a>
        </header>

        {query.message && (
          <section className="panel">
            <div className="success">{query.message}</div>
          </section>
        )}

        {query.error && (
          <section className="panel">
            <div className="error">{query.error}</div>
          </section>
        )}

        <section className="panel">
          <h2>Articoli acquistati</h2>
          {rows.length === 0 ? (
            <div className="empty">Nessun articolo acquistato.</div>
          ) : (
            <CustomerArticlesList
              rows={rows}
              totalResidual={totalResidual}
              customerId={id}
              markInBox={markInBox}
              updateSale={updateSale}
              deleteSale={deleteSale}
            />
          )}
        </section>
      </section>
    </main>
  )
}
