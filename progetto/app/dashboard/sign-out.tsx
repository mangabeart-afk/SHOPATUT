'use client'
import { createClient } from '../../lib/supabase-browser'

export default function SignOutButton({ label = 'Esci' }: { label?: string }) {
  return (
    <button
      type="button"
      className="signout"
      onClick={async () => {
        await createClient().auth.signOut()
        window.location.assign('/login')
      }}
    >
      {label}
    </button>
  )
}
