import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { auth } from '@/auth'
import { signIn } from '@/lib/auth-client'

const getSession = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const session = await auth.api.getSession({ headers: request.headers })
  return session
})

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const session = await getSession()
    if (session?.user) {
      throw redirect({ to: '/settings' })
    }
  },
  component: ConnectPage,
})

function ConnectPage() {
  const handleGoogleSignIn = () => {
    signIn.social({ provider: "google", callbackURL: "/settings" })
  }

  const handleMicrosoftSignIn = () => {
    signIn.social({ provider: "microsoft", callbackURL: "/settings" })
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
          <h1 className="text-2xl font-medium text-stone-900 mb-2">Janus</h1>
          <p className="text-stone-500 text-center text-sm leading-relaxed">
            Your AI calendar assistant.<br />
            Connect your calendar to get started.
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

        <p className="opacity-0 animate-fade-in [animation-delay:300ms] mt-8 text-center text-xs text-stone-400">
          By connecting, you agree to allow Janus to access your calendar.
        </p>
      </div>
    </div>
  )
}
