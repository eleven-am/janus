import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '@/lib/middleware'
import { getCalendarProvider, ProviderId } from '@/providers/calendar'
import { validateProviderId } from '@/lib/validation'
import { logError } from '@/lib/logging'

export const Route = createFileRoute('/api/v1/calendars/$calendarId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) return authResult

        const { calendarId } = params
        const url = new URL(request.url)
        const providerParam = url.searchParams.get('provider') || ProviderId.GOOGLE
        const providerId = validateProviderId(providerParam)

        if (!providerId) {
          return Response.json(
            { error: 'Invalid provider', code: 'INVALID_PROVIDER', validProviders: Object.values(ProviderId) },
            { status: 400 }
          )
        }

        try {
          const provider = getCalendarProvider(authResult.userId, providerId)
          const calendar = await provider.getCalendar(calendarId)

          return Response.json({ calendar })
        } catch (error) {
          logError('calendar_get_failed', { error, userId: authResult.userId, providerId, calendarId })

          if (error instanceof Error) {
            if (error.message.includes('No Google account linked') || error.message.includes('No Microsoft account linked')) {
              return Response.json({ error: 'Calendar not connected', code: 'CALENDAR_NOT_LINKED' }, { status: 400 })
            }
            if (error.message.includes('Not Found') || error.message.includes('notFound')) {
              return Response.json({ error: 'Calendar not found', code: 'NOT_FOUND' }, { status: 404 })
            }
          }

          const errorWithCode = error as { code?: number }
          if (errorWithCode.code === 401 || errorWithCode.code === 403) {
            return Response.json({ error: 'Calendar access expired', code: 'TOKEN_EXPIRED' }, { status: 401 })
          }
          if (errorWithCode.code === 404) {
            return Response.json({ error: 'Calendar not found', code: 'NOT_FOUND' }, { status: 404 })
          }

          return Response.json({ error: 'Failed to get calendar', code: 'INTERNAL_ERROR' }, { status: 500 })
        }
      },
    },
  },
})
