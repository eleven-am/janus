import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '@/lib/middleware'
import {
  getCalendarProvider,
  ProviderId,
} from '@/providers/calendar'
import {
  validateProviderId,
  updateEventSchema,
  formatZodErrors,
  toUpdateEventParams,
} from '@/lib/validation'
import { logError } from '@/lib/logging'

function handleProviderError(error: unknown, context: { userId: string; providerId: string; calendarId: string; eventId: string; operation: string }) {
  logError(`event_${context.operation}_failed`, { error, ...context })

  if (error instanceof Error) {
    if (error.message.includes('No Google account linked') || error.message.includes('No Microsoft account linked')) {
      return Response.json({ error: 'Calendar not connected', code: 'CALENDAR_NOT_LINKED' }, { status: 400 })
    }
    if (error.message.includes('Not Found') || error.message.includes('notFound')) {
      return Response.json({ error: 'Event not found', code: 'NOT_FOUND' }, { status: 404 })
    }
  }

  const errorWithCode = error as { code?: number }
  if (errorWithCode.code === 401 || errorWithCode.code === 403) {
    return Response.json({ error: 'Calendar access expired', code: 'TOKEN_EXPIRED' }, { status: 401 })
  }
  if (errorWithCode.code === 404) {
    return Response.json({ error: 'Event not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  return Response.json({ error: `Failed to ${context.operation} event`, code: 'INTERNAL_ERROR' }, { status: 500 })
}

export const Route = createFileRoute('/api/v1/calendars/$calendarId/events/$eventId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) return authResult

        const { calendarId, eventId } = params
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
          const event = await provider.getEvent(calendarId, eventId)

          return Response.json({ event })
        } catch (error) {
          return handleProviderError(error, { userId: authResult.userId, providerId, calendarId, eventId, operation: 'get' })
        }
      },

      PATCH: async ({ request, params }) => {
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) return authResult

        const { calendarId, eventId } = params
        const url = new URL(request.url)
        const providerParam = url.searchParams.get('provider') || ProviderId.GOOGLE
        const providerId = validateProviderId(providerParam)

        if (!providerId) {
          return Response.json(
            { error: 'Invalid provider', code: 'INVALID_PROVIDER', validProviders: Object.values(ProviderId) },
            { status: 400 }
          )
        }

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, { status: 400 })
        }

        const parseResult = updateEventSchema.safeParse(body)
        if (!parseResult.success) {
          return Response.json(
            { error: 'Validation failed', code: 'VALIDATION_ERROR', details: formatZodErrors(parseResult.error) },
            { status: 400 }
          )
        }

        try {
          const provider = getCalendarProvider(authResult.userId, providerId)
          const eventParams = toUpdateEventParams(parseResult.data)
          const event = await provider.updateEvent(calendarId, eventId, eventParams)

          return Response.json({ event })
        } catch (error) {
          return handleProviderError(error, { userId: authResult.userId, providerId, calendarId, eventId, operation: 'update' })
        }
      },

      DELETE: async ({ request, params }) => {
        const authResult = await requireAuth(request)
        if (authResult instanceof Response) return authResult

        const { calendarId, eventId } = params
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
          await provider.deleteEvent(calendarId, eventId)

          return new Response(null, { status: 204 })
        } catch (error) {
          return handleProviderError(error, { userId: authResult.userId, providerId, calendarId, eventId, operation: 'delete' })
        }
      },
    },
  },
})
