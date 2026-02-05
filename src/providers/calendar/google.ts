import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { config } from "@/config/index.js";
import { auth } from "@/auth/index.js";
import { CalendarProvider } from "./base.js";
import {
  ProviderId,
  EventStatus,
  Visibility,
  RecurrenceFrequency,
  toCalendarId,
  toEventId,
  type Calendar,
  type CalendarEvent,
  type ListEventsParams,
  type CreateEventParams,
  type UpdateEventParams,
  type ResponseStatus,
  type ReminderMethod,
  type RecurrenceRule,
  type EventDateTime,
  type EventReminders,
} from "./types.js";

function buildRruleString(rule: RecurrenceRule): string {
  const freqMap: Record<string, string> = {
    [RecurrenceFrequency.DAILY]: "DAILY",
    [RecurrenceFrequency.WEEKLY]: "WEEKLY",
    [RecurrenceFrequency.MONTHLY]: "MONTHLY",
    [RecurrenceFrequency.YEARLY]: "YEARLY",
  };

  const parts: string[] = [`FREQ=${freqMap[rule.frequency]}`];

  if (rule.interval && rule.interval > 1) {
    parts.push(`INTERVAL=${rule.interval}`);
  }

  if (rule.end) {
    if (rule.end.type === "count") {
      parts.push(`COUNT=${rule.end.count}`);
    } else if (rule.end.type === "until") {
      const untilDate = rule.end.until.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
      parts.push(`UNTIL=${untilDate}`);
    }
  }

  if (rule.byDay && rule.byDay.length > 0) {
    parts.push(`BYDAY=${rule.byDay.join(",")}`);
  }

  if (rule.byMonthDay && rule.byMonthDay.length > 0) {
    parts.push(`BYMONTHDAY=${rule.byMonthDay.join(",")}`);
  }

  if (rule.byMonth && rule.byMonth.length > 0) {
    parts.push(`BYMONTH=${rule.byMonth.join(",")}`);
  }

  return `RRULE:${parts.join(";")}`;
}

function toGoogleDateTime(dt: EventDateTime): { dateTime?: string; date?: string; timeZone?: string } {
  if (dt.kind === "timed") {
    return { dateTime: dt.dateTime, timeZone: dt.timeZone };
  }
  return { date: dt.date };
}

function toGoogleReminders(reminders: EventReminders): calendar_v3.Schema$Event["reminders"] {
  if (reminders.type === "default") {
    return { useDefault: true };
  }
  return {
    useDefault: false,
    overrides: reminders.overrides.map((r) => ({
      method: r.method,
      minutes: r.minutes,
    })),
  };
}

export class GoogleCalendarProvider extends CalendarProvider {
  readonly providerId = ProviderId.GOOGLE;
  private readonly userId: string;
  private readonly oauth2Client: OAuth2Client;
  private calendarApi: calendar_v3.Calendar;
  private tokenExpiresAt: number | null = null;

  constructor(userId: string) {
    super();
    this.userId = userId;
    this.oauth2Client = new google.auth.OAuth2(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
    );
    this.calendarApi = google.calendar({ version: "v3", auth: this.oauth2Client });
  }

  private async ensureInitialized(): Promise<void> {
    const now = Date.now();
    const bufferMs = 60 * 1000;

    if (this.tokenExpiresAt && now < this.tokenExpiresAt - bufferMs) {
      return;
    }

    const tokenResult = await auth.api.getAccessToken({
      body: {
        providerId: ProviderId.GOOGLE,
        userId: this.userId,
      },
    });

    if (!tokenResult?.accessToken) {
      throw new Error("No Google account linked for this user");
    }

    this.oauth2Client.setCredentials({
      access_token: tokenResult.accessToken,
    });

    this.tokenExpiresAt = tokenResult.accessTokenExpiresAt
      ? new Date(tokenResult.accessTokenExpiresAt).getTime()
      : now + 3600 * 1000;
  }

  private mapCalendar(item: calendar_v3.Schema$CalendarListEntry): Calendar {
    return {
      id: toCalendarId(item.id!),
      name: item.summary ?? "Untitled",
      description: item.description ?? undefined,
      color: item.backgroundColor ?? undefined,
      primary: item.primary ?? false,
      accessRole: item.accessRole as Calendar["accessRole"],
      timeZone: item.timeZone ?? undefined,
    };
  }

  private mapEventDateTime(
    start: calendar_v3.Schema$EventDateTime | undefined
  ): EventDateTime {
    if (start?.dateTime) {
      return { kind: "timed", dateTime: start.dateTime, timeZone: start.timeZone ?? undefined };
    }
    return { kind: "allDay", date: start?.date ?? "" };
  }

  private mapReminders(
    reminders: calendar_v3.Schema$Event["reminders"] | undefined
  ): EventReminders | undefined {
    if (!reminders) return undefined;
    if (reminders.useDefault) {
      return { type: "default" };
    }
    if (reminders.overrides && reminders.overrides.length > 0) {
      return {
        type: "custom",
        overrides: reminders.overrides.map((r) => ({
          method: r.method as ReminderMethod,
          minutes: r.minutes!,
        })),
      };
    }
    return { type: "default" };
  }

  private mapEvent(
    item: calendar_v3.Schema$Event,
    calendarId: string,
  ): CalendarEvent {
    return {
      id: toEventId(item.id!),
      calendarId: toCalendarId(calendarId),
      summary: item.summary ?? "Untitled",
      description: item.description ?? undefined,
      location: item.location ?? undefined,
      start: this.mapEventDateTime(item.start),
      end: this.mapEventDateTime(item.end),
      status: (item.status as CalendarEvent["status"]) ?? EventStatus.CONFIRMED,
      attendees: item.attendees?.map((a) => ({
        email: a.email!,
        displayName: a.displayName ?? undefined,
        responseStatus: a.responseStatus as ResponseStatus,
        optional: a.optional ?? undefined,
        organizer: a.organizer ?? undefined,
        self: a.self ?? undefined,
      })),
      organizer: item.organizer
        ? {
            email: item.organizer.email!,
            displayName: item.organizer.displayName ?? undefined,
            self: item.organizer.self ?? undefined,
          }
        : undefined,
      created: item.created ?? undefined,
      updated: item.updated ?? undefined,
      htmlLink: item.htmlLink ?? undefined,
      recurringEventId: item.recurringEventId ? toEventId(item.recurringEventId) : undefined,
      visibility:
        (item.visibility as CalendarEvent["visibility"]) ?? Visibility.DEFAULT,
      reminders: this.mapReminders(item.reminders),
      recurrence: item.recurrence ?? undefined,
    };
  }

  async listCalendars(): Promise<Calendar[]> {
    await this.ensureInitialized();

    const response = await this.calendarApi.calendarList.list();
    return (response.data.items ?? []).map((item) => this.mapCalendar(item));
  }

  async getCalendar(calendarId: string): Promise<Calendar> {
    await this.ensureInitialized();

    const response = await this.calendarApi.calendarList.get({
      calendarId,
    });
    return this.mapCalendar(response.data);
  }

  async listEvents(params: ListEventsParams): Promise<CalendarEvent[]> {
    await this.ensureInitialized();

    const response = await this.calendarApi.events.list({
      calendarId: params.calendarId,
      timeMin: params.timeMin?.toISOString(),
      timeMax: params.timeMax?.toISOString(),
      maxResults: params.maxResults,
      q: params.query,
      singleEvents: params.singleEvents,
      orderBy: params.orderBy,
    });

    return (response.data.items ?? []).map((item) =>
      this.mapEvent(item, String(params.calendarId)),
    );
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    await this.ensureInitialized();

    const response = await this.calendarApi.events.get({
      calendarId,
      eventId,
    });
    return this.mapEvent(response.data, calendarId);
  }

  async createEvent(
    calendarId: string,
    event: CreateEventParams,
  ): Promise<CalendarEvent> {
    await this.ensureInitialized();

    const response = await this.calendarApi.events.insert({
      calendarId,
      sendUpdates: event.sendUpdates,
      requestBody: {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: toGoogleDateTime(event.start),
        end: toGoogleDateTime(event.end),
        attendees: event.attendees?.map((a) => ({
          email: a.email,
          displayName: a.displayName,
          optional: a.optional,
        })),
        visibility: event.visibility,
        reminders: event.reminders ? toGoogleReminders(event.reminders) : undefined,
        recurrence: event.recurrence
          ? [buildRruleString(event.recurrence)]
          : undefined,
      },
    });

    return this.mapEvent(response.data, calendarId);
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    event: UpdateEventParams,
  ): Promise<CalendarEvent> {
    await this.ensureInitialized();

    const response = await this.calendarApi.events.patch({
      calendarId,
      eventId,
      sendUpdates: event.sendUpdates,
      requestBody: {
        summary: event.summary,
        description: event.description,
        location: event.location,
        start: event.start ? toGoogleDateTime(event.start) : undefined,
        end: event.end ? toGoogleDateTime(event.end) : undefined,
        attendees: event.attendees?.map((a) => ({
          email: a.email,
          displayName: a.displayName,
          optional: a.optional,
        })),
        visibility: event.visibility,
        reminders: event.reminders ? toGoogleReminders(event.reminders) : undefined,
        recurrence: event.recurrence
          ? [buildRruleString(event.recurrence)]
          : undefined,
      },
    });

    return this.mapEvent(response.data, calendarId);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.ensureInitialized();

    await this.calendarApi.events.delete({
      calendarId,
      eventId,
    });
  }
}
