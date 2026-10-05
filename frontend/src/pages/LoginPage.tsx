import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { supabase, useSession } from '../lib/supabase'

const inputClass =
  'w-full px-4 py-3 bg-surface border border-surface-border rounded-xl text-text-primary ' +
  'placeholder:text-text-muted font-body text-sm focus:outline-none focus:border-accent/50 ' +
  'focus:ring-1 focus:ring-accent/20 transition-all'
const labelClass = 'block text-xs font-mono text-text-muted uppercase tracking-wider mb-2'

export default function LoginPage() {
  const session = useSession()
  const [signUp, setSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)

  if (session) return <Navigate to="/shorten" replace />

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')
    const { error } = signUp
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } })
      : await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) setError(error.message)
    else if (signUp) setNotice('Check your email to confirm your account')
  }

  return (
    <div className="min-h-screen pt-28 pb-20 px-6">
      <div className="max-w-md mx-auto">
        <h1 className="font-display text-4xl font-extrabold text-text-primary mb-2">
          {signUp ? 'Create account' : 'Sign in'}
        </h1>
        <p className="text-text-secondary font-body mb-8">Links belong to your account.</p>

        <form onSubmit={submit} className="rounded-2xl border border-surface-border bg-surface-raised p-6 space-y-4">
          <div>
            <label htmlFor="email" className={labelClass}>Email</label>
            <input id="email" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="password" className={labelClass}>Password</label>
            <input id="password" type="password" required minLength={6} value={password}
              autoComplete={signUp ? 'new-password' : 'current-password'}
              onChange={(e) => setPassword(e.target.value)} className={inputClass} />
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-3 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/25">
              <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
              <p className="text-sm text-rose-300 font-body">{error}</p>
            </div>
          )}
          {notice && (
            <p role="status" className="px-4 py-3 rounded-xl bg-accent/5 border border-accent/30 text-sm text-accent font-body">
              {notice}
            </p>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 bg-accent text-surface rounded-xl font-semibold font-body hover:bg-accent-dim
            transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
            {signUp ? 'Sign up' : 'Sign in'}
          </button>
        </form>

        <button type="button" onClick={() => { setSignUp(!signUp); setError(''); setNotice('') }}
          className="mt-4 text-sm text-text-secondary hover:text-accent transition-colors font-body">
          {signUp ? 'Have an account? Sign in' : 'No account? Sign up'}
        </button>
      </div>
    </div>
  )
}
