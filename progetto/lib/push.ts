import { createAdminClient } from './supabase-admin'

type PushSubscriptionRow = {
  id: string
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
}

type MailboxAssignment = {
  mailbox_id: string
  article_id: string
  quantity_assigned: number
}

export const PUSH_MESSAGES = {
  articleInStock: 'Articolo arrivano nella tua casella',
  allReady: 'Tutti i tuoi articoli sono pronti per essere spediti',
} as const

function getVapidConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:admin@shopatut.it'
  if (!publicKey || !privateKey) return null
  return { publicKey, privateKey, subject }
}

export async function sendPushToUser(userId: string, title: string, body: string, eventKey: string, url = '/dashboard') {
  const config = getVapidConfig()
  if (!config) return { sent: 0, skipped: true, reason: 'VAPID non configurato' }

  const admin = createAdminClient()

  // Reserve the event before sending so concurrent requests cannot send duplicates.
  const { error: reservationError } = await admin.from('push_notification_events').insert({
    user_id: userId,
    event_key: eventKey,
    event_type: title,
    body,
    delivered_count: 0,
  })
  if (reservationError) {
    if (reservationError.code === '23505') return { sent: 0, skipped: true, reason: 'Evento già inviato' }
    throw reservationError
  }

  const { data: subscriptions, error } = await admin
    .from('push_subscriptions')
    .select('id,user_id,endpoint,p256dh,auth')
    .eq('user_id', userId)

  if (error) throw error
  if (!subscriptions?.length) return { sent: 0, skipped: true, reason: 'Nessuna subscription' }

  const { default: webpush } = await import('web-push')
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey)

  let sent = 0
  for (const row of subscriptions as PushSubscriptionRow[]) {
    const payload = JSON.stringify({ title, body, url, tag: eventKey })
    try {
      await webpush.sendNotification({
        endpoint: row.endpoint,
        keys: { p256dh: row.p256dh, auth: row.auth },
      }, payload)
      sent += 1
    } catch (error: any) {
      const statusCode = Number(error?.statusCode || 0)
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', row.id)
      }
    }
  }

  await admin.from('push_notification_events')
    .update({ delivered_count: sent })
    .eq('event_key', eventKey)

  return { sent, skipped: false }
}

export async function notifyArticleArrivals(articleIds: string[]) {
  if (!articleIds.length || !getVapidConfig()) return

  const admin = createAdminClient()
  const { data: assignments } = await admin
    .from('article_assignments')
    .select('mailbox_id,article_id,quantity_assigned')
    .in('article_id', articleIds)
    .in('status', ['ATTIVA', 'IN_BOX'])

  const rows = (assignments || []) as MailboxAssignment[]
  const mailboxIds = [...new Set(rows.map((row) => row.mailbox_id))]
  if (!mailboxIds.length) return

  const { data: profiles } = await admin
    .from('profiles')
    .select('user_id,mailbox_id,role')
    .in('mailbox_id', mailboxIds)
    .eq('role', 'CLIENTE')

  const profileByMailbox = new Map((profiles || []).map((profile) => [profile.mailbox_id, profile]))
  const changedByMailbox = new Map<string, string[]>()
  for (const row of rows) {
    const list = changedByMailbox.get(row.mailbox_id) || []
    if (!list.includes(row.article_id)) list.push(row.article_id)
    changedByMailbox.set(row.mailbox_id, list)
  }

  for (const [mailboxId, changedArticleIds] of changedByMailbox) {
    const profile = profileByMailbox.get(mailboxId)
    if (!profile) continue

    for (const articleId of changedArticleIds) {
      await sendPushToUser(
        profile.user_id,
        'ShopaTüT',
        PUSH_MESSAGES.articleInStock,
        `article-in-stock:${articleId}:${mailboxId}`,
      )
    }

    const { data: activeAssignments } = await admin
      .from('article_assignments')
      .select('article_id')
      .eq('mailbox_id', mailboxId)
      .in('status', ['ATTIVA', 'IN_BOX'])

    const activeArticleIds = [...new Set((activeAssignments || []).map((row) => row.article_id))]
    if (!activeArticleIds.length) continue

    const { data: articles } = await admin
      .from('articles')
      .select('id,status')
      .in('id', activeArticleIds)

    const allStock = (articles || []).length === activeArticleIds.length &&
      (articles || []).every((article) => article.status === 'IN_STOCK' || article.status === 'VENDUTO')

    if (!allStock) continue

    const setKey = activeArticleIds.sort().join(',')
    await sendPushToUser(
      profile.user_id,
      'ShopaTüT',
      PUSH_MESSAGES.allReady,
      `mailbox-all-stock:${mailboxId}:${setKey}`,
    )
  }
}
