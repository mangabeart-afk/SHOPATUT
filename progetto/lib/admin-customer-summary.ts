export type AdminCustomerSummaryRow = {
  customer_id: string
  customer_code: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  notes: string | null
  mailbox_id: string | null
  balance: number
  stock: number
  box: number
  incoming: number
  last_order: string | null
  last_payment: string | null
}

const PAGE_SIZE = 1000

async function fetchAllRows<T>(queryForRange: (from: number, to: number) => any): Promise<{ data: T[]; error: any }> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await queryForRange(from, from + PAGE_SIZE - 1)
    if (error) return { data: [], error }
    const batch = (data || []) as T[]
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return { data: rows, error: null }
}

export async function getAdminCustomerSummary(supabase: any): Promise<{
  data: AdminCustomerSummaryRow[]
  error: any
}> {
  // Le tabelle di movimentazione superano il limite predefinito di righe di Supabase:
  // carichiamo tutti i blocchi, altrimenti saldi e contatori risultano incompleti/stagnanti.
  const [customersResult, mailboxesResult, assignmentsResult, articlesResult, salesMovementsResult, cancelledSalesResult, paymentsResult, creditsResult] = await Promise.all([
    fetchAllRows<any>((from, to) => supabase
      .from('customers')
      .select('id,customer_code,first_name,last_name,email,phone,notes')
      .order('last_name', { ascending: true })
      .order('first_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('mailboxes').select('id,customer_id').range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('article_assignments').select('mailbox_id,article_id,quantity_assigned,status').in('status', ['IN_BOX', 'IN_STOCK', 'IN_ARRIVO']).range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('articles').select('id').is('deleted_at', null).range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('movements').select('id,mailbox_id,movement_at,total_amount_eur,movement_type').in('movement_type', ['VENDITA', 'ALTRO', 'ARTICOLO', 'SPEDIZIONE', 'MODIFICA', 'STORNO']).range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('movements').select('reference_id').eq('movement_type', 'ANNULLAMENTO').not('reference_id', 'is', null).range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('payments').select('mailbox_id,payment_date,amount_eur,status').range(from, to)),
    fetchAllRows<any>((from, to) => supabase.from('credits').select('mailbox_id,amount_eur,used_amount_eur,status').range(from, to)),
  ])

  const firstError = [customersResult, mailboxesResult, assignmentsResult, articlesResult, salesMovementsResult, cancelledSalesResult, paymentsResult, creditsResult]
    .find((result) => result.error)?.error || null
  if (firstError) return { data: [], error: firstError }

  const mailboxByCustomer = new Map<string, any>()
  for (const mailbox of mailboxesResult.data || []) {
    if (mailbox.customer_id) mailboxByCustomer.set(mailbox.customer_id, mailbox)
  }

  // Conta solo assegnazioni che puntano ancora a un articolo vivo in archivio.
  // Lo stato logistico è quello dell'assegnazione, non quello globale dell'articolo.
  const activeArticleIds = new Set<string>((articlesResult.data || []).map((article: any) => article.id))
  const aggregatesByMailbox = new Map<string, {
    balance: number; stock: number; box: number; incoming: number;
    last_order: string | null; last_payment: string | null
  }>()
  const getAggregate = (mailboxId: string) => {
    const existing = aggregatesByMailbox.get(mailboxId)
    if (existing) return existing
    const created = { balance: 0, stock: 0, box: 0, incoming: 0, last_order: null, last_payment: null }
    aggregatesByMailbox.set(mailboxId, created)
    return created
  }

  // Il saldo comprende tutte le registrazioni che generano un addebito o una rettifica.
  // PAGAMENTO è già sottratto dalla tabella payments; ANNULLAMENTO viene usato solo
  // per escludere il movimento originario tramite reference_id.
  const allMovements = (salesMovementsResult.data || []) as any[]
  const cancelledSaleIds = new Set((cancelledSalesResult.data || [])
    .map((movement: any) => movement.reference_id)
    .filter(Boolean))

  for (const movement of allMovements) {
    if (!movement.mailbox_id || cancelledSaleIds.has(movement.id)) continue
    const aggregate = getAggregate(movement.mailbox_id)
    aggregate.balance += Number(movement.total_amount_eur || 0)
    if (!aggregate.last_order || String(movement.movement_at || '') > aggregate.last_order) aggregate.last_order = movement.movement_at || null
  }

  for (const payment of paymentsResult.data || []) {
    if (!payment.mailbox_id || payment.status === 'ANNULLATO') continue
    const aggregate = getAggregate(payment.mailbox_id)
    aggregate.balance -= Number(payment.amount_eur || 0)
    if (!aggregate.last_payment || String(payment.payment_date || '') > aggregate.last_payment) aggregate.last_payment = payment.payment_date || null
  }

  for (const credit of creditsResult.data || []) {
    if (!credit.mailbox_id || credit.status === 'ANNULLATO') continue
    const aggregate = getAggregate(credit.mailbox_id)
    aggregate.balance -= Math.max(0, Number(credit.amount_eur || 0) - Number(credit.used_amount_eur || 0))
  }

  for (const assignment of assignmentsResult.data || []) {
    if (!assignment.mailbox_id || !assignment.article_id || !activeArticleIds.has(assignment.article_id)) continue
    const aggregate = getAggregate(assignment.mailbox_id)
    const quantity = Number(assignment.quantity_assigned || 0)
    if (assignment.status === 'IN_BOX') aggregate.box += quantity
    if (assignment.status === 'IN_STOCK') aggregate.stock += quantity
    if (assignment.status === 'IN_ARRIVO') aggregate.incoming += quantity
  }

  const rows = (customersResult.data || []).map((customer: any) => {
    const mailbox = mailboxByCustomer.get(customer.id) || null
    const aggregate = mailbox ? getAggregate(mailbox.id) : null
    const rawBalance = Number(aggregate?.balance || 0)
    return {
      customer_id: customer.id,
      customer_code: customer.customer_code,
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      notes: customer.notes,
      mailbox_id: mailbox?.id || null,
      balance: Math.max(0, Math.round(rawBalance * 100) / 100),
      stock: Number(aggregate?.stock || 0),
      box: Number(aggregate?.box || 0),
      incoming: Number(aggregate?.incoming || 0),
      last_order: aggregate?.last_order || null,
      last_payment: aggregate?.last_payment || null,
    }
  })
  return { data: rows, error: null }
}
