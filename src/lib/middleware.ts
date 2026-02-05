import { auth } from '@/auth/index'
import { logEvent } from '@/lib/logging'

type Session = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>

export interface AuthContext {
  userId: string
  session: Session
}

export async function requireAuth(request: Request): Promise<AuthContext | Response> {
  const session = await auth.api.getSession({
    headers: request.headers,
  })

  if (!session) {
    const url = new URL(request.url)
    logEvent('auth_failed', {
      path: url.pathname,
      method: request.method,
    })

    return Response.json({ error: 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 })
  }

  return {
    userId: session.user.id,
    session,
  }
}
