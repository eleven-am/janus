import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/auth'
import { db } from '@/db'
import { account } from '@/db/auth.schema'
import { eq } from 'drizzle-orm'
import { signIn, oauth2 } from '@/lib/auth-client'
import { useEffect, useRef } from 'react'

const getLinkData = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session?.user) {
    return { isAuthenticated: false as const }
  }

  const accounts = await db
    .select({ providerId: account.providerId })
    .from(account)
    .where(eq(account.userId, session.user.id))

  return {
    isAuthenticated: true as const,
    user: session.user,
    isHuLinked: accounts.some((a) => a.providerId === 'hu'),
  }
})

export const Route = createFileRoute('/link')({
  beforeLoad: async () => {
    const data = await getLinkData()
    return data
  },
  loader: ({ context }) => context,
  component: LinkPage,
})

function LinkPage() {
  const data = Route.useLoaderData()
  const linkTriggered = useRef(false)

  useEffect(() => {
    if (data.isAuthenticated && !data.isHuLinked && !linkTriggered.current) {
      linkTriggered.current = true
      oauth2.link({ providerId: "hu", callbackURL: "/link" })
    }
  }, [data])

  if (!data.isAuthenticated) {
    return <SignInView />
  }

  if (data.isHuLinked) {
    return <SuccessView name={data.user.name} />
  }

  return <LinkingView />
}

function SignInView() {
  const handleGoogleSignIn = () => {
    signIn.social({ provider: "google", callbackURL: "/link" })
  }

  const handleMicrosoftSignIn = () => {
    signIn.social({ provider: "microsoft", callbackURL: "/link" })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="opacity-0 animate-fade-in flex flex-col items-center mb-12">
          <img
            src="/logo.jpeg"
            alt="Janus"
            className="w-20 h-20 rounded-2xl shadow-lg mb-6"
          />
          <h1 className="text-2xl font-medium text-stone-900 mb-2">Link your Hu account</h1>
          <p className="text-stone-500 text-center text-sm leading-relaxed">
            Sign in to connect your Hu voice assistant<br />
            with Janus.
          </p>
        </div>

        <div className="opacity-0 animate-fade-in-up [animation-delay:150ms] space-y-3">
          <button
            onClick={handleGoogleSignIn}
            className="group flex items-center justify-center gap-3 w-full px-5 py-3.5 bg-white border border-stone-200 rounded-xl text-stone-700 font-medium text-sm transition-all duration-200 hover:border-stone-300 hover:shadow-md hover:shadow-stone-200/50 active:scale-[0.98] cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <button
            onClick={handleMicrosoftSignIn}
            className="group flex items-center justify-center gap-3 w-full px-5 py-3.5 bg-white border border-stone-200 rounded-xl text-stone-700 font-medium text-sm transition-all duration-200 hover:border-stone-300 hover:shadow-md hover:shadow-stone-200/50 active:scale-[0.98] cursor-pointer"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#F25022" d="M1 1h10v10H1z"/>
              <path fill="#00A4EF" d="M1 13h10v10H1z"/>
              <path fill="#7FBA00" d="M13 1h10v10H13z"/>
              <path fill="#FFB900" d="M13 13h10v10H13z"/>
            </svg>
            Continue with Microsoft
          </button>
        </div>
      </div>
    </div>
  )
}

function SuccessView({ name }: { name: string }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="opacity-0 animate-fade-in flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-medium text-stone-900 mb-2">You're all set, {name}</h1>
          <p className="text-stone-500 text-sm leading-relaxed mb-8">
            Your Hu account is linked to Janus.<br />
            You can close this page.
          </p>
          <span className="flex items-center gap-1.5 text-sm text-emerald-600">
            <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
            Connected
          </span>
        </div>
      </div>
    </div>
  )
}

function LinkingView() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="opacity-0 animate-fade-in flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-violet-50 flex items-center justify-center mb-6 animate-pulse">
            <svg className="w-8 h-8 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h1 className="text-xl font-medium text-stone-900 mb-2">Linking your Hu account</h1>
          <p className="text-stone-500 text-sm">Redirecting to Hu for authorization...</p>
        </div>
      </div>
    </div>
  )
}
