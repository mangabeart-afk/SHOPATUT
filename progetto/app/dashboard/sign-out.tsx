'use client'
import { createClient } from '../../lib/supabase-browser'
import { clearAllAdminCache } from '../../lib/admin-cache-client'

export default function SignOutButton({ label = 'Esci' }: { label?: string }) {
  return (
    <button
      type="button"
      className="signout"
      onClick={async () => {
        await clearAllAdminCache()
        await createClient().auth.signOut()
        window.location.assign('/login')
      }}
    >
      {label}
    </button>
  )
}
