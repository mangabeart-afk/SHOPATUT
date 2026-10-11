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
  incoming: number
  last_order: string | null
  last_payment: string | null
}

export async function getAdminCustomerSummary(supabase: any): Promise<{
  data: AdminCustomerSummaryRow[]
  error: any
}> {
  const [
    customersResult,
    mailboxesResult,
    assignmentsResult,
    articlesResult,
    movementsResult,
    paymentsResult,
    creditsResult,
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id,customer_code,first_name,last_name,email,phone,notes')
      .order('last_name', { ascending: true }),
    supabase
      .from('mailboxes')
      .select('id,customer_id'),
    supabase
      .from('article_assignments')
      .select('mailbox_id,article_id,quantity_assigned,status'),
    supabase
      .from('articles')
      .select('id,status'),
    supabase
      .from('movements')
      .select('mailbox_id,movement_type,movement_at,total_amount_eur'),
    supabase
      .from('payments')
      .select('mailbox_id,payment_date,amount_eur,status'),
    supabase
      .from('credits')
      .select('mailbox_id,amount_eur,used_amount_eur,status'),
  ])

  const firstError = [
    customersResult,
    mailboxesResult,
    assignmentsResult,
    articlesResult,
    movementsResult,
    paymentsResult,
    creditsResult,
  ].find((result) => result.error)?.error || null

  if (firstError) {
    return { data: [], error: firstError }
  }

  const mailboxByCustomer = new Map<string, any>()
  for (const mailbox of mailboxesResult.data || []) {
    if (mailbox.customer_id) mailboxByCustomer.set(mailbox.customer_id, mailbox)
  }

  const articlesById = new Map<string, string>()
  for (const article of articlesResult.data || []) {
    articlesById.set(article.id, article.status)
  }

  const aggregatesByMailbox = new Map<
    string,
    {
      balance: number
      stock: number
      incoming: number
      last_order: string | null
      last_payment: string | null
    }
  >()

  const getAggregate = (mailboxId: string) => {
    const existing = aggregatesByMailbox.get(mailboxId)
    if (existing) return existing
    const created = { balance: 0, stock: 0, incoming: 0, last_order: null, last_payment: null }
    aggregatesByMailbox.set(mailboxId, created)
    return created
  }

  for (const movement of movementsResult.data || []) {
    if (!movement.mailbox_id) continue
    const aggregate = getAggregate(movement.mailbox_id)
    if (movement.movement_type === 'VENDITA') {
      aggregate.balance += Number(movement.total_amount_eur || 0)
      if (!aggregate.last_order || String(movement.movement_at || '') > aggregate.last_order) {
        aggregate.last_order = movement.movement_at || null
      }
    }
  }

  for (const payment of paymentsResult.data || []) {
    if (!payment.mailbox_id || payment.status === 'ANNULLATO') continue
    const aggregate = getAggregate(payment.mailbox_id)
    aggregate.balance -= Number(payment.amount_eur || 0)
    if (!aggregate.last_payment || String(payment.payment_date || '') > aggregate.last_payment) {
      aggregate.last_payment = payment.payment_date || null
    }
  }

  for (const credit of creditsResult.data || []) {
    if (!credit.mailbox_id || credit.status === 'ANNULLATO') continue
    const aggregate = getAggregate(credit.mailbox_id)
    aggregate.balance -= Math.max(
      0,
      Number(credit.amount_eur || 0) - Number(credit.used_amount_eur || 0),
    )
  }

  for (const assignment of assignmentsResult.data || []) {
    if (!assignment.mailbox_id || assignment.status !== 'ATTIVA' && assignment.status !== 'IN_BOX') continue
    const articleStatus = articlesById.get(assignment.article_id)
    if (articleStatus !== 'IN_STOCK' && articleStatus !== 'IN_ARRIVO' && articleStatus !== 'VENDUTO') continue
    const aggregate = getAggregate(assignment.mailbox_id)
    const quantity = Number(assignment.quantity_assigned || 0)
    if (articleStatus === 'IN_STOCK' || articleStatus === 'VENDUTO') aggregate.stock += quantity
    if (articleStatus === 'IN_ARRIVO') aggregate.incoming += quantity
  }

  const rows = (customersResult.data || []).map((customer: any) => {
    const mailbox = mailboxByCustomer.get(customer.id) || null
    const aggregate = mailbox ? getAggregate(mailbox.id) : null
    return {
      customer_id: customer.id,
      customer_code: customer.customer_code,
      first_name: customer.first_name,
      last_name: customer.last_name,
      email: customer.email,
      phone: customer.phone,
      notes: customer.notes,
      mailbox_id: mailbox?.id || null,
      balance: Math.max(0, Number(aggregate?.balance || 0)),
      stock: Number(aggregate?.stock || 0),
      incoming: Number(aggregate?.incoming || 0),
      last_order: aggregate?.last_order || null,
      last_payment: aggregate?.last_payment || null,
    }
  })

  return { data: rows, error: null }
}
