import { redirect } from 'next/navigation'
import { createClient } from './supabase-server'

export type AppRole = 'AMMINISTRATORE' | 'CLIENTE'
export type UserProfile = {
  role: string | null
  display_name: string | null
  customer_id: string | null
  mailbox_id: string | null
}

export async function requirePageContext(expectedRole?: AppRole) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: rawProfile, error } = await supabase
    .from('profiles')
    .select('role,display_name,customer_id,mailbox_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new Error(`Impossibile leggere il profilo: ${error.message}`)
  const profile: UserProfile = {
    role: rawProfile?.role || 'CLIENTE',
    display_name: rawProfile?.display_name || null,
    customer_id: rawProfile?.customer_id || null,
    mailbox_id: rawProfile?.mailbox_id || null,
  }
  if (expectedRole && profile.role !== expectedRole) {
    redirect(expectedRole === 'AMMINISTRATORE' ? '/dashboard' : '/admin')
  }
  return { supabase, user, profile }
}

/** Business data is not read here: this lookup only resolves the authenticated profile to a workbook sheet key. */
export async function resolveCustomerCode(supabase: Awaited<ReturnType<typeof createClient>>, profile: UserProfile): Promise<string | null> {
  if (profile.customer_id) {
    const { data } = await supabase.from('customers').select('customer_code').eq('id', profile.customer_id).maybeSingle()
    const code = String(data?.customer_code || '').trim()
    if (code) return code
  }
  if (profile.mailbox_id) {
    const { data: mailbox } = await supabase.from('mailboxes').select('customer_id').eq('id', profile.mailbox_id).maybeSingle()
    if (mailbox?.customer_id) {
      const { data: customer } = await supabase.from('customers').select('customer_code').eq('id', mailbox.customer_id).maybeSingle()
      const code = String(customer?.customer_code || '').trim()
      if (code) return code
    }
  }
  return null
}
