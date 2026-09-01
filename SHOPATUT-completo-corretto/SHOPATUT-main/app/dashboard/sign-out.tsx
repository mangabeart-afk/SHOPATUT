'use client'
import { createClient } from '../../lib/supabase-browser'
export default function SignOutButton(){ return <button className="signout" onClick={async()=>{await createClient().auth.signOut(); window.location.assign('/login')}}>Esci</button> }
