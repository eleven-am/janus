import { createFileRoute } from '@tanstack/react-router'
import { createAuthToken } from '@eleven-am/hu-sdk'
import { config } from '@/config/index'
import { requireAuth } from '@/lib/middleware'
import { logError } from '@/lib/logging'
import { loadPrivateKey } from '@/lib/hu-utils'

export const Route = createFileRoute('/api/v1/link/init')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) return authResult

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, { status: 400 })
        }

        const { redirect_uri } = body as { redirect_uri?: string }

        if (!redirect_uri) {
          return Response.json({ error: 'redirect_uri is required', code: 'MISSING_PARAM' }, { status: 400 })
        }

        try {
          const redirectUrl = new URL(redirect_uri)
          const appUrl = new URL(config.APP_URL)

          if (redirectUrl.host !== appUrl.host) {
            return Response.json(
              { error: 'redirect_uri must match application host', code: 'INVALID_REDIRECT' },
              { status: 400 }
            )
          }
        } catch {
          return Response.json({ error: 'Invalid redirect_uri format', code: 'INVALID_REDIRECT' }, { status: 400 })
        }

        const huApiUrl = config.HU_URL?.replace('ws://', 'http://').replace('wss://', 'https://')
        const privateKey = loadPrivateKey()

        if (!huApiUrl || !config.HU_AGENT_ID || !privateKey) {
          return Response.json({ error: 'Linking not available', code: 'SERVICE_UNAVAILABLE' }, { status: 503 })
        }

        try {
          const token = await createAuthToken({
            agentId: config.HU_AGENT_ID,
            privateKey,
            gatewayUrl: config.HU_URL || '',
          })

          const response = await fetch(`${huApiUrl}/auth/link/init`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              agent_user_id: authResult.userId,
              redirect_uri,
            }),
          })

          if (!response.ok) {
            const errorText = await response.text()
            logError('link_init_hu_failed', { error: errorText, userId: authResult.userId, status: response.status })
            return Response.json({ error: 'Failed to initialize link', code: 'HU_ERROR' }, { status: response.status })
          }

          const data = await response.json()
          return Response.json(data)
        } catch (error) {
          logError('link_init_failed', { error, userId: authResult.userId })
          return Response.json({ error: 'Failed to initialize link', code: 'INTERNAL_ERROR' }, { status: 500 })
        }
      },
    },
  },
})
