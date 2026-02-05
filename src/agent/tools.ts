import { tool, zodSchema } from "ai";
import { z } from "zod";
import {
  EventOrderBy,
  getCalendarProvider,
  ProviderId,
  SendUpdates,
  ReminderMethod,
  RecurrenceFrequency,
  Weekday,
} from "@/providers/calendar/index.js";
import { logError } from "@/lib/logging.js";

const recurrenceSchema = z
  .object({
    frequency: z
      .enum(["daily", "weekly", "monthly", "yearly"])
      .describe("How often the event repeats"),
    interval: z
      .number()
      .optional()
      .describe("Repeat every N days/weeks/months/years (default: 1)"),
    count: z
      .number()
      .optional()
      .describe("Number of occurrences before stopping"),
    until: z
      .string()
      .optional()
      .describe("End date for recurrence in ISO 8601 format"),
    byDay: z
      .array(z.enum(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]))
      .optional()
      .describe("For weekly: which days (e.g., ['MO', 'WE', 'FR'] for Mon/Wed/Fri)"),
    byMonthDay: z
      .array(z.number())
      .optional()
      .describe("For monthly: which days of month (e.g., [1, 15] for 1st and 15th)"),
    byMonth: z
      .array(z.number())
      .optional()
      .describe("For yearly: which months (1-12)"),
  })
  .optional()
  .describe(
    "Recurrence rule for repeating events. Examples: {frequency: 'daily'} for every day, {frequency: 'weekly', byDay: ['MO', 'WE', 'FR']} for Mon/Wed/Fri, {frequency: 'monthly', byMonthDay: [1]} for 1st of each month"
  );

interface ToolContext {
  userId: string;
}

interface ToolError {
  error: true;
  message: string;
  code?: string;
}

function handleToolError(error: unknown, ctx: ToolContext, operation: string): ToolError {
  logError(`tool_${operation}_failed`, { error, userId: ctx.userId });

  if (error instanceof Error) {
    if (error.message.includes('No Google account linked')) {
      return { error: true, message: 'Google Calendar is not connected. Please link your account first.', code: 'NOT_LINKED' };
    }
    if (error.message.includes('No Microsoft account linked')) {
      return { error: true, message: 'Outlook Calendar is not connected. Please link your account first.', code: 'NOT_LINKED' };
    }
    if (error.message.includes('not supported yet')) {
      return { error: true, message: error.message, code: 'UNSUPPORTED_PROVIDER' };
    }
  }

  return { error: true, message: `Failed to ${operation}. Please try again.`, code: 'OPERATION_FAILED' };
}

export function createCalendarTools(ctx: ToolContext) {
  const provider = getCalendarProvider(ctx.userId, ProviderId.GOOGLE);

  return {
    list_calendars: tool({
      description:
        "List all calendars available to the user. Call this first to discover calendar IDs. Returns an array of calendars with their IDs and names. The primary calendar ID is usually 'primary'. Use the returned calendar IDs for other operations.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        console.log("[TOOL] list_calendars called for user:", ctx.userId);
        try {
          const result = await provider.listCalendars();
          console.log("[TOOL] list_calendars result:", JSON.stringify(result).slice(0, 200));
          return result;
        } catch (error) {
          console.error("[TOOL] list_calendars error:", error);
          return handleToolError(error, ctx, 'list_calendars');
        }
      },
    }),

    list_events: tool({
      description: "List events from a calendar within a date range. Returns events with their IDs, titles, times, locations, and attendees. Use this to check what meetings or events the user has scheduled. For today's events, use today's date as timeMin and tomorrow as timeMax. Always include both timeMin and timeMax.",
      inputSchema: zodSchema(
        z.object({
          calendarId: z
            .string()
            .describe(
              "Calendar ID from list_calendars. Use 'primary' for user's main calendar"
            ),
          timeMin: z
            .string()
            .describe(
              "Start of date range in ISO 8601 format (e.g., 2024-01-15T00:00:00Z)"
            ),
          timeMax: z
            .string()
            .describe(
              "End of date range in ISO 8601 format (e.g., 2024-01-16T23:59:59Z)"
            ),
          maxResults: z
            .number()
            .optional()
            .describe("Maximum number of events to return"),
          query: z
            .string()
            .optional()
            .describe("Free text search query to filter events"),
        })
      ),
      execute: async ({ calendarId, timeMin, timeMax, maxResults, query }) => {
        console.log("[TOOL] list_events called:", { calendarId, timeMin, timeMax, maxResults, query });
        try {
          const result = await provider.listEvents({
            calendarId,
            timeMin: new Date(timeMin),
            timeMax: new Date(timeMax),
            maxResults,
            query,
            singleEvents: true,
            orderBy: EventOrderBy.START_TIME,
          });
          console.log("[TOOL] list_events result:", JSON.stringify(result).slice(0, 500));
          return result;
        } catch (error) {
          console.error("[TOOL] list_events error:", error);
          return handleToolError(error, ctx, 'list_events');
        }
      },
    }),

    get_event: tool({
      description: "Get full details of a specific event by its ID. Returns the event summary, description, start and end times, location, attendees, reminders, and recurrence rules. Use this when you need more details about a specific event from the list.",
      inputSchema: zodSchema(
        z.object({
          calendarId: z.string().describe("Calendar ID containing the event"),
          eventId: z.string().describe("Event ID to retrieve"),
        })
      ),
      execute: async ({ calendarId, eventId }) => {
        try {
          return await provider.getEvent(calendarId, eventId);
        } catch (error) {
          return handleToolError(error, ctx, 'get_event');
        }
      },
    }),

    create_event: tool({
      description:
        "Create a new calendar event. Requires a title (summary), start time, and end time. Optionally add location, description, attendees (by email), reminders, and recurrence for repeating events. Returns the created event with its ID. Use ISO 8601 format for dates like 2024-01-15T14:00:00.",
      inputSchema: zodSchema(
        z.object({
          calendarId: z
            .string()
            .describe(
              "Calendar ID to create event in. Use 'primary' for user's main calendar"
            ),
          summary: z.string().describe("Event title/summary"),
          description: z.string().optional().describe("Event description"),
          location: z.string().optional().describe("Event location"),
          startDateTime: z.string().describe("Event start in ISO 8601 format"),
          endDateTime: z.string().describe("Event end in ISO 8601 format"),
          timeZone: z
            .string()
            .describe("REQUIRED: IANA timezone for the event (e.g., 'Europe/Paris', 'America/New_York'). You MUST provide this."),
          attendees: z
            .array(z.string())
            .optional()
            .describe("List of attendee email addresses"),
          reminders: z
            .object({
              useDefault: z
                .boolean()
                .describe("Use default calendar reminders"),
              overrides: z
                .array(
                  z.object({
                    method: z
                      .enum(["email", "popup", "sms"])
                      .describe("Reminder method"),
                    minutes: z
                      .number()
                      .describe(
                        "Minutes before event to trigger reminder (e.g., 10 for 10 minutes, 60 for 1 hour, 1440 for 1 day)"
                      ),
                  })
                )
                .optional()
                .describe("Custom reminder overrides"),
            })
            .optional()
            .describe(
              "Event reminders. Set useDefault: true for calendar defaults, or provide overrides with specific methods and times"
            ),
          recurrence: recurrenceSchema,
        })
      ),
      execute: async ({
        calendarId,
        summary,
        description,
        location,
        startDateTime,
        endDateTime,
        timeZone,
        attendees,
        reminders,
        recurrence,
      }) => {
        try {
          return await provider.createEvent(calendarId, {
            summary,
            description,
            location,
            start: { kind: "timed", dateTime: startDateTime, timeZone },
            end: { kind: "timed", dateTime: endDateTime, timeZone },
            attendees: attendees?.map((email: string) => ({ email })),
            sendUpdates: SendUpdates.ALL,
            reminders: reminders
              ? reminders.useDefault
                ? { type: "default" }
                : {
                    type: "custom",
                    overrides: reminders.overrides?.map((r) => ({
                      method: r.method as typeof ReminderMethod[keyof typeof ReminderMethod],
                      minutes: r.minutes,
                    })) ?? [],
                  }
              : undefined,
            recurrence: recurrence
              ? {
                  frequency: recurrence.frequency as typeof RecurrenceFrequency[keyof typeof RecurrenceFrequency],
                  interval: recurrence.interval,
                  end: recurrence.count
                    ? { type: "count", count: recurrence.count }
                    : recurrence.until
                    ? { type: "until", until: recurrence.until }
                    : { type: "forever" },
                  byDay: recurrence.byDay as typeof Weekday[keyof typeof Weekday][],
                  byMonthDay: recurrence.byMonthDay,
                  byMonth: recurrence.byMonth,
                }
              : undefined,
          });
        } catch (error) {
          return handleToolError(error, ctx, 'create_event');
        }
      },
    }),

    update_event: tool({
      description:
        "Update an existing calendar event. Requires the event ID from list_events or create_event. You can change the title, time, location, description, attendees, reminders, or recurrence. Only provide the fields you want to change.",
      inputSchema: zodSchema(
        z.object({
          calendarId: z.string().describe("Calendar ID containing the event"),
          eventId: z.string().describe("Event ID to update"),
          summary: z.string().optional().describe("New event title"),
          description: z.string().optional().describe("New event description"),
          location: z.string().optional().describe("New event location"),
          startDateTime: z
            .string()
            .optional()
            .describe("New start time in ISO 8601 format"),
          endDateTime: z
            .string()
            .optional()
            .describe("New end time in ISO 8601 format"),
          timeZone: z.string().optional().describe("Timezone for the event"),
          reminders: z
            .object({
              useDefault: z
                .boolean()
                .describe("Use default calendar reminders"),
              overrides: z
                .array(
                  z.object({
                    method: z
                      .enum(["email", "popup", "sms"])
                      .describe("Reminder method"),
                    minutes: z
                      .number()
                      .describe(
                        "Minutes before event to trigger reminder (e.g., 10 for 10 minutes, 60 for 1 hour, 1440 for 1 day)"
                      ),
                  })
                )
                .optional()
                .describe("Custom reminder overrides"),
            })
            .optional()
            .describe(
              "Event reminders. Set useDefault: true for calendar defaults, or provide overrides with specific methods and times"
            ),
          recurrence: recurrenceSchema,
        })
      ),
      execute: async ({
        calendarId,
        eventId,
        summary,
        description,
        location,
        startDateTime,
        endDateTime,
        timeZone,
        reminders,
        recurrence,
      }) => {
        try {
          return await provider.updateEvent(calendarId, eventId, {
            summary,
            description,
            location,
            start: startDateTime
              ? { kind: "timed", dateTime: startDateTime, timeZone }
              : undefined,
            end: endDateTime
              ? { kind: "timed", dateTime: endDateTime, timeZone }
              : undefined,
            sendUpdates: SendUpdates.ALL,
            reminders: reminders
              ? reminders.useDefault
                ? { type: "default" }
                : {
                    type: "custom",
                    overrides: reminders.overrides?.map((r) => ({
                      method: r.method as typeof ReminderMethod[keyof typeof ReminderMethod],
                      minutes: r.minutes,
                    })) ?? [],
                  }
              : undefined,
            recurrence: recurrence
              ? {
                  frequency: recurrence.frequency as typeof RecurrenceFrequency[keyof typeof RecurrenceFrequency],
                  interval: recurrence.interval,
                  end: recurrence.count
                    ? { type: "count", count: recurrence.count }
                    : recurrence.until
                    ? { type: "until", until: recurrence.until }
                    : { type: "forever" },
                  byDay: recurrence.byDay as typeof Weekday[keyof typeof Weekday][],
                  byMonthDay: recurrence.byMonthDay,
                  byMonth: recurrence.byMonth,
                }
              : undefined,
          });
        } catch (error) {
          return handleToolError(error, ctx, 'update_event');
        }
      },
    }),

    delete_event: tool({
      description: "Delete a calendar event permanently. Requires the event ID. Use this when the user wants to cancel or remove an event. This action cannot be undone.",
      inputSchema: zodSchema(
        z.object({
          calendarId: z.string().describe("Calendar ID containing the event"),
          eventId: z.string().describe("Event ID to delete"),
        })
      ),
      execute: async ({ calendarId, eventId }) => {
        try {
          await provider.deleteEvent(calendarId, eventId);
          return { success: true, message: `Event ${eventId} deleted successfully` };
        } catch (error) {
          return handleToolError(error, ctx, 'delete_event');
        }
      },
    }),
  };
}
