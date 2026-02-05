import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { account } from '@/db/auth.schema'
import { eq } from 'drizzle-orm'
import { signIn, signOut, linkSocial, oauth2 } from '@/lib/auth-client'

const getSettingsData = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session?.user) {
    return null
  }

  const accounts = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, session.user.id))

  return {
    user: session.user,
    accounts: accounts.map((a) => a.providerId),
  }
})

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    const data = await getSettingsData()
    if (!data) {
      throw redirect({ to: '/' })
    }
    return data
  },
  loader: ({ context }) => context,
  component: SettingsPage,
})

function SettingsPage() {
  const data = Route.useLoaderData()

  const handleSignOut = () => {
    signOut({ fetchOptions: { onSuccess: () => window.location.href = '/' } })
  }

  const handleConnectHu = () => {
    oauth2.link({ providerId: "hu", callbackURL: "/settings" })
  }

  const handleConnectGoogle = () => {
    linkSocial({ provider: "google", callbackURL: "/settings" })
  }

  const handleConnectMicrosoft = () => {
    linkSocial({ provider: "microsoft", callbackURL: "/settings" })
  }

  return (
    <div className="min-h-screen px-6 py-12">
      <div className="max-w-lg mx-auto">
        <header className="opacity-0 animate-fade-in flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="Janus" className="w-10 h-10 rounded-xl" />
            <span className="font-medium text-stone-900">Janus</span>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-stone-500 hover:text-stone-700 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </header>

        <div className="opacity-0 animate-fade-in [animation-delay:100ms] mb-10">
          <div className="flex items-center gap-4">
            {data.user.image ? (
              <img
                src={data.user.image}
                alt={data.user.name}
                className="w-14 h-14 rounded-full"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-stone-200 flex items-center justify-center">
                <span className="text-lg font-medium text-stone-600">
                  {data.user.name?.charAt(0) || '?'}
                </span>
              </div>
            )}
            <div>
              <h1 className="text-lg font-medium text-stone-900">{data.user.name}</h1>
              <p className="text-sm text-stone-500">{data.user.email}</p>
            </div>
          </div>
        </div>

        <section className="opacity-0 animate-fade-in-up [animation-delay:200ms] mb-8">
          <h2 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-4">
            Connected Calendars
          </h2>
          <div className="space-y-3">
            <CalendarConnection
              provider="google"
              name="Google Calendar"
              connected={data.accounts.includes('google')}
              onConnect={handleConnectGoogle}
            />
            <CalendarConnection
              provider="microsoft"
              name="Microsoft Outlook"
              connected={data.accounts.includes('microsoft')}
              onConnect={handleConnectMicrosoft}
            />
          </div>
        </section>

        <section className="opacity-0 animate-fade-in-up [animation-delay:300ms]">
          <h2 className="text-xs font-medium text-stone-400 uppercase tracking-wider mb-4">
            Hu Integration
          </h2>
          <div className="bg-white border border-stone-200 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-stone-900">Hu Voice Assistant</p>
                  <p className="text-sm text-stone-500">
                    {data.accounts.includes('hu') ? 'Account linked' : 'Not connected'}
                  </p>
                </div>
              </div>
              {data.accounts.includes('hu') ? (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                  Connected
                </span>
              ) : (
                <button
                  onClick={handleConnectHu}
                  className="px-4 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-sm font-medium rounded-lg hover:from-violet-600 hover:to-purple-700 transition-all cursor-pointer"
                >
                  Connect
                </button>
              )}
            </div>
            <p className="mt-4 pt-4 border-t border-stone-100 text-sm text-stone-500">
              {data.accounts.includes('hu')
                ? 'Voice-powered calendar management is ready. Say "Hey Hu" to get started.'
                : 'Connect your Hu account to enable voice-powered calendar management.'}
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

function CalendarConnection({
  provider,
  name,
  connected,
  onConnect,
}: {
  provider: 'google' | 'microsoft'
  name: string
  connected: boolean
  onConnect: () => void
}) {
  const icons = {
    google: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
    microsoft: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path fill="#F25022" d="M1 1h10v10H1z"/>
        <path fill="#00A4EF" d="M1 13h10v10H1z"/>
        <path fill="#7FBA00" d="M13 1h10v10H13z"/>
        <path fill="#FFB900" d="M13 13h10v10H13z"/>
      </svg>
    ),
  }

  return (
    <div className="flex items-center justify-between bg-white border border-stone-200 rounded-xl px-5 py-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-stone-50 flex items-center justify-center">
          {icons[provider]}
        </div>
        <div>
          <p className="font-medium text-stone-900">{name}</p>
          <p className="text-sm text-stone-500">
            {connected ? 'Calendar synced' : 'Not connected'}
          </p>
        </div>
      </div>
      {connected ? (
        <span className="flex items-center gap-1.5 text-sm text-emerald-600">
          <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
          Connected
        </span>
      ) : (
        <button
          onClick={onConnect}
          className="px-4 py-2 bg-stone-100 text-stone-700 text-sm font-medium rounded-lg hover:bg-stone-200 transition-colors cursor-pointer"
        >
          Connect
        </button>
      )}
    </div>
  )
}
