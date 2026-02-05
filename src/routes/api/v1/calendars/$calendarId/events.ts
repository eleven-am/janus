import { createFileRoute } from '@tanstack/react-router'
import { requireAuth } from '@/lib/middleware'
import {
  getCalendarProvider,
  ProviderId,
  type ListEventsParams,
} from '@/providers/calendar/index'
import {
  validateProviderId,
  validateDate,
  validatePositiveInt,
  createEventSchema,
  formatZodErrors,
  toCreateEventParams,
} from '@/lib/validation'
import { logError } from '@/lib/logging'

function handleProviderError(error: unknown, context: { userId: string; providerId: string; calendarId: string; operation: string }) {
  logError(`event_${context.operation}_failed`, { error, ...context })

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

  return Response.json({ error: `Failed to ${context.operation} events`, code: 'INTERNAL_ERROR' }, { status: 500 })
}

export const Route = createFileRoute('/api/v1/calendars/$calendarId/events')({
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

        const timeMinParam = url.searchParams.get('timeMin')
        const timeMaxParam = url.searchParams.get('timeMax')
        const maxResultsParam = url.searchParams.get('maxResults')

        const timeMin = timeMinParam ? validateDate(timeMinParam) : undefined
        const timeMax = timeMaxParam ? validateDate(timeMaxParam) : undefined
        const maxResults = maxResultsParam ? validatePositiveInt(maxResultsParam) : undefined

        if (timeMinParam && !timeMin) {
          return Response.json({ error: 'Invalid timeMin date format', code: 'INVALID_DATE' }, { status: 400 })
        }
        if (timeMaxParam && !timeMax) {
          return Response.json({ error: 'Invalid timeMax date format', code: 'INVALID_DATE' }, { status: 400 })
        }
        if (maxResultsParam && !maxResults) {
          return Response.json({ error: 'maxResults must be a positive integer', code: 'INVALID_PARAM' }, { status: 400 })
        }

        const listParams: ListEventsParams = {
          calendarId,
          timeMin: timeMin ?? undefined,
          timeMax: timeMax ?? undefined,
          maxResults: maxResults ?? undefined,
          query: url.searchParams.get('q') || undefined,
          singleEvents: url.searchParams.get('singleEvents') === 'true',
          orderBy: url.searchParams.get('orderBy') as ListEventsParams['orderBy'],
        }

        try {
          const provider = getCalendarProvider(authResult.userId, providerId)
          const events = await provider.listEvents(listParams)

          return Response.json({ events })
        } catch (error) {
          return handleProviderError(error, { userId: authResult.userId, providerId, calendarId, operation: 'list' })
        }
      },

      POST: async ({ request, params }) => {
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

        let body: unknown
        try {
          body = await request.json()
        } catch {
          return Response.json({ error: 'Invalid JSON body', code: 'INVALID_JSON' }, { status: 400 })
        }

        const parseResult = createEventSchema.safeParse(body)
        if (!parseResult.success) {
          return Response.json(
            { error: 'Validation failed', code: 'VALIDATION_ERROR', details: formatZodErrors(parseResult.error) },
            { status: 400 }
          )
        }

        try {
          const provider = getCalendarProvider(authResult.userId, providerId)
          const eventParams = toCreateEventParams(parseResult.data)
          const event = await provider.createEvent(calendarId, eventParams)

          return Response.json({ event }, { status: 201 })
        } catch (error) {
          return handleProviderError(error, { userId: authResult.userId, providerId, calendarId, operation: 'create' })
        }
      },
    },
  },
})
