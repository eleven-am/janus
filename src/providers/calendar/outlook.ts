import { Client } from "@microsoft/microsoft-graph-client";
import type { Calendar as GraphCalendar, Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import { auth } from "@/auth/index.js";
import { CalendarProvider } from "./base.js";
import {
  ProviderId,
  EventStatus,
  Visibility,
  AccessRole,
  RecurrenceFrequency,
  Weekday,
  toCalendarId,
  toEventId,
  type Calendar,
  type CalendarEvent,
  type ListEventsParams,
  type CreateEventParams,
  type UpdateEventParams,
  type ResponseStatus,
  type RecurrenceRule,
  type EventDateTime,
  type EventReminders,
  type ReminderMethod,
} from "./types.js";

const GRAPH_DAY_TO_WEEKDAY: Record<string, Weekday> = {
  monday: Weekday.MONDAY,
  tuesday: Weekday.TUESDAY,
  wednesday: Weekday.WEDNESDAY,
  thursday: Weekday.THURSDAY,
  friday: Weekday.FRIDAY,
  saturday: Weekday.SATURDAY,
  sunday: Weekday.SUNDAY,
};

const WEEKDAY_TO_GRAPH_DAY: Record<Weekday, string> = {
  [Weekday.MONDAY]: "monday",
  [Weekday.TUESDAY]: "tuesday",
  [Weekday.WEDNESDAY]: "wednesday",
  [Weekday.THURSDAY]: "thursday",
  [Weekday.FRIDAY]: "friday",
  [Weekday.SATURDAY]: "saturday",
  [Weekday.SUNDAY]: "sunday",
};

const GRAPH_RESPONSE_STATUS_MAP: Record<string, ResponseStatus> = {
  none: "needsAction",
  notResponded: "needsAction",
  organizer: "accepted",
  tentativelyAccepted: "tentative",
  accepted: "accepted",
  declined: "declined",
};

function parseGraphRecurrence(recurrence: GraphEvent["recurrence"]): string[] | undefined {
  if (!recurrence?.pattern || !recurrence?.range) {
    return undefined;
  }

  const { pattern, range } = recurrence;
  const parts: string[] = [];

  const freqMap: Record<string, string> = {
    daily: "DAILY",
    weekly: "WEEKLY",
    absoluteMonthly: "MONTHLY",
    relativeMonthly: "MONTHLY",
    absoluteYearly: "YEARLY",
    relativeYearly: "YEARLY",
  };

  const freq = freqMap[pattern.type || ""];
  if (!freq) {
    return undefined;
  }

  parts.push(`FREQ=${freq}`);

  if (pattern.interval && pattern.interval > 1) {
    parts.push(`INTERVAL=${pattern.interval}`);
  }

  if (pattern.daysOfWeek && pattern.daysOfWeek.length > 0) {
    const byDay = pattern.daysOfWeek
      .map((d) => GRAPH_DAY_TO_WEEKDAY[d.toLowerCase()])
      .filter(Boolean);
    if (byDay.length > 0) {
      parts.push(`BYDAY=${byDay.join(",")}`);
    }
  }

  if (pattern.dayOfMonth) {
    parts.push(`BYMONTHDAY=${pattern.dayOfMonth}`);
  }

  if (pattern.month) {
    parts.push(`BYMONTH=${pattern.month}`);
  }

  if (range.type === "endDate" && range.endDate) {
    const untilDate = range.endDate.replace(/-/g, "");
    parts.push(`UNTIL=${untilDate}T235959Z`);
  } else if (range.type === "numbered" && range.numberOfOccurrences) {
    parts.push(`COUNT=${range.numberOfOccurrences}`);
  }

  return [`RRULE:${parts.join(";")}`];
}

function buildGraphRecurrence(rule: RecurrenceRule, startDate: string): GraphEvent["recurrence"] {
  const freqMap: Record<RecurrenceFrequency, string> = {
    [RecurrenceFrequency.DAILY]: "daily",
    [RecurrenceFrequency.WEEKLY]: "weekly",
    [RecurrenceFrequency.MONTHLY]: "absoluteMonthly",
    [RecurrenceFrequency.YEARLY]: "absoluteYearly",
  };

  const pattern: NonNullable<GraphEvent["recurrence"]>["pattern"] = {
    type: freqMap[rule.frequency] as "daily" | "weekly" | "absoluteMonthly" | "absoluteYearly",
    interval: rule.interval ?? 1,
  };

  if (rule.byDay && rule.byDay.length > 0) {
    pattern.daysOfWeek = rule.byDay.map((d) => WEEKDAY_TO_GRAPH_DAY[d]) as ("sunday" | "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday")[];
  }

  if (rule.byMonthDay && rule.byMonthDay.length > 0) {
    pattern.dayOfMonth = rule.byMonthDay[0];
  }

  if (rule.byMonth && rule.byMonth.length > 0) {
    pattern.month = rule.byMonth[0];
  }

  const range: NonNullable<GraphEvent["recurrence"]>["range"] = {
    startDate: startDate.split("T")[0],
    type: "noEnd",
  };

  if (rule.end) {
    if (rule.end.type === "until") {
      range.type = "endDate";
      range.endDate = rule.end.until.split("T")[0];
    } else if (rule.end.type === "count") {
      range.type = "numbered";
      range.numberOfOccurrences = rule.end.count;
    }
  }

  return { pattern, range };
}

function toGraphDateTime(dt: EventDateTime): { dateTime?: string; timeZone: string } {
  if (dt.kind === "timed") {
    return { dateTime: dt.dateTime, timeZone: dt.timeZone ?? "UTC" };
  }
  return { dateTime: dt.date, timeZone: "UTC" };
}

function toGraphReminders(reminders: EventReminders): { isReminderOn: boolean; reminderMinutesBeforeStart?: number } {
  if (reminders.type === "default") {
    return { isReminderOn: false };
  }
  if (reminders.overrides.length > 0) {
    return { isReminderOn: true, reminderMinutesBeforeStart: reminders.overrides[0].minutes };
  }
  return { isReminderOn: false };
}

export class OutlookCalendarProvider extends CalendarProvider {
  readonly providerId = ProviderId.OUTLOOK;
  private readonly userId: string;
  private graphClient: Client | null = null;
  private tokenExpiresAt: number | null = null;

  constructor(userId: string) {
    super();
    this.userId = userId;
  }

  private async ensureInitialized(): Promise<Client> {
    const now = Date.now();
    const bufferMs = 60 * 1000;

    if (this.graphClient && this.tokenExpiresAt && now < this.tokenExpiresAt - bufferMs) {
      return this.graphClient;
    }

    const tokenResult = await auth.api.getAccessToken({
      body: {
        providerId: "microsoft",
        userId: this.userId,
      },
    });

    if (!tokenResult?.accessToken) {
      throw new Error("No Microsoft account linked for this user");
    }

    this.graphClient = Client.init({
      authProvider: (done) => {
        done(null, tokenResult.accessToken);
      },
    });

    this.tokenExpiresAt = tokenResult.accessTokenExpiresAt
      ? new Date(tokenResult.accessTokenExpiresAt).getTime()
      : now + 3600 * 1000;

    return this.graphClient;
  }

  private mapCalendar(item: GraphCalendar): Calendar {
    return {
      id: toCalendarId(item.id!),
      name: item.name ?? "Untitled",
      description: undefined,
      color: item.hexColor ?? undefined,
      primary: item.isDefaultCalendar ?? false,
      accessRole: item.canEdit ? AccessRole.OWNER : AccessRole.READER,
      timeZone: undefined,
    };
  }

  private mapEventDateTime(
    dt: GraphEvent["start"] | GraphEvent["end"] | undefined,
    isAllDay: boolean | null | undefined
  ): EventDateTime {
    if (isAllDay && dt?.dateTime) {
      return { kind: "allDay", date: dt.dateTime.split("T")[0] };
    }
    if (dt?.dateTime) {
      return { kind: "timed", dateTime: dt.dateTime, timeZone: dt.timeZone ?? undefined };
    }
    return { kind: "allDay", date: "" };
  }

  private mapReminders(
    isReminderOn: boolean | null | undefined,
    reminderMinutes: number | null | undefined
  ): EventReminders {
    if (isReminderOn && reminderMinutes !== undefined && reminderMinutes !== null) {
      return {
        type: "custom",
        overrides: [{ method: "popup" as ReminderMethod, minutes: reminderMinutes }],
      };
    }
    return { type: "default" };
  }

  private mapEvent(item: GraphEvent, calendarId: string): CalendarEvent {
    const statusMap: Record<string, CalendarEvent["status"]> = {
      free: EventStatus.CONFIRMED,
      tentative: EventStatus.TENTATIVE,
      busy: EventStatus.CONFIRMED,
      oof: EventStatus.CONFIRMED,
      workingElsewhere: EventStatus.CONFIRMED,
      unknown: EventStatus.CONFIRMED,
    };

    const visibilityMap: Record<string, CalendarEvent["visibility"]> = {
      normal: Visibility.DEFAULT,
      personal: Visibility.PRIVATE,
      private: Visibility.PRIVATE,
      confidential: Visibility.CONFIDENTIAL,
    };

    return {
      id: toEventId(item.id!),
      calendarId: toCalendarId(calendarId),
      summary: item.subject ?? "Untitled",
      description: item.bodyPreview ?? item.body?.content ?? undefined,
      location: item.location?.displayName ?? undefined,
      start: this.mapEventDateTime(item.start, item.isAllDay),
      end: this.mapEventDateTime(item.end, item.isAllDay),
      status: item.isCancelled ? EventStatus.CANCELLED : (statusMap[item.showAs || ""] ?? EventStatus.CONFIRMED),
      attendees: item.attendees?.map((a) => ({
        email: a.emailAddress?.address ?? "",
        displayName: a.emailAddress?.name ?? undefined,
        responseStatus: GRAPH_RESPONSE_STATUS_MAP[a.status?.response || "none"] ?? "needsAction",
        optional: a.type === "optional",
        organizer: false,
        self: false,
      })),
      organizer: item.organizer?.emailAddress
        ? {
            email: item.organizer.emailAddress.address ?? "",
            displayName: item.organizer.emailAddress.name ?? undefined,
            self: item.isOrganizer ?? undefined,
          }
        : undefined,
      created: item.createdDateTime ?? undefined,
      updated: item.lastModifiedDateTime ?? undefined,
      htmlLink: item.webLink ?? undefined,
      recurringEventId: item.seriesMasterId ? toEventId(item.seriesMasterId) : undefined,
      visibility: visibilityMap[item.sensitivity || "normal"] ?? Visibility.DEFAULT,
      reminders: this.mapReminders(item.isReminderOn, item.reminderMinutesBeforeStart),
      recurrence: parseGraphRecurrence(item.recurrence),
    };
  }

  async listCalendars(): Promise<Calendar[]> {
    const client = await this.ensureInitialized();

    const response = await client.api("/me/calendars").get();
    return (response.value ?? []).map((item: GraphCalendar) => this.mapCalendar(item));
  }

  async getCalendar(calendarId: string): Promise<Calendar> {
    const client = await this.ensureInitialized();

    const response = await client.api(`/me/calendars/${calendarId}`).get();
    return this.mapCalendar(response);
  }

  async listEvents(params: ListEventsParams): Promise<CalendarEvent[]> {
    const client = await this.ensureInitialized();

    let request = client.api(`/me/calendars/${params.calendarId}/events`);

    const filters: string[] = [];
    if (params.timeMin) {
      filters.push(`start/dateTime ge '${params.timeMin.toISOString()}'`);
    }
    if (params.timeMax) {
      filters.push(`end/dateTime le '${params.timeMax.toISOString()}'`);
    }

    if (filters.length > 0) {
      request = request.filter(filters.join(" and "));
    }

    if (params.maxResults) {
      request = request.top(params.maxResults);
    }

    if (params.query) {
      request = request.search(params.query);
    }

    if (params.orderBy === "startTime") {
      request = request.orderby("start/dateTime asc");
    } else if (params.orderBy === "updated") {
      request = request.orderby("lastModifiedDateTime desc");
    }

    const response = await request.get();
    return (response.value ?? []).map((item: GraphEvent) =>
      this.mapEvent(item, String(params.calendarId)),
    );
  }

  async getEvent(calendarId: string, eventId: string): Promise<CalendarEvent> {
    const client = await this.ensureInitialized();

    const response = await client
      .api(`/me/calendars/${calendarId}/events/${eventId}`)
      .get();
    return this.mapEvent(response, calendarId);
  }

  async createEvent(
    calendarId: string,
    event: CreateEventParams,
  ): Promise<CalendarEvent> {
    const client = await this.ensureInitialized();

    const graphEvent: Partial<GraphEvent> = {
      subject: event.summary,
      body: event.description
        ? { contentType: "text", content: event.description }
        : undefined,
      location: event.location ? { displayName: event.location } : undefined,
      start: toGraphDateTime(event.start),
      end: toGraphDateTime(event.end),
      isAllDay: event.start.kind === "allDay",
      attendees: event.attendees?.map((a) => ({
        emailAddress: { address: a.email, name: a.displayName },
        type: a.optional ? "optional" : "required",
      })),
      sensitivity: event.visibility === Visibility.PRIVATE
        ? "private"
        : event.visibility === Visibility.CONFIDENTIAL
        ? "confidential"
        : "normal",
    };

    if (event.reminders) {
      const reminderConfig = toGraphReminders(event.reminders);
      graphEvent.isReminderOn = reminderConfig.isReminderOn;
      if (reminderConfig.reminderMinutesBeforeStart !== undefined) {
        graphEvent.reminderMinutesBeforeStart = reminderConfig.reminderMinutesBeforeStart;
      }
    }

    if (event.recurrence && event.start.kind === "timed") {
      graphEvent.recurrence = buildGraphRecurrence(
        event.recurrence,
        event.start.dateTime,
      );
    }

    const response = await client
      .api(`/me/calendars/${calendarId}/events`)
      .post(graphEvent);

    return this.mapEvent(response, calendarId);
  }

  async updateEvent(
    calendarId: string,
    eventId: string,
    event: UpdateEventParams,
  ): Promise<CalendarEvent> {
    const client = await this.ensureInitialized();

    const graphEvent: Partial<GraphEvent> = {};

    if (event.summary !== undefined) {
      graphEvent.subject = event.summary;
    }

    if (event.description !== undefined) {
      graphEvent.body = { contentType: "text", content: event.description };
    }

    if (event.location !== undefined) {
      graphEvent.location = { displayName: event.location };
    }

    if (event.start !== undefined) {
      graphEvent.start = toGraphDateTime(event.start);
      graphEvent.isAllDay = event.start.kind === "allDay";
    }

    if (event.end !== undefined) {
      graphEvent.end = toGraphDateTime(event.end);
    }

    if (event.attendees !== undefined) {
      graphEvent.attendees = event.attendees.map((a) => ({
        emailAddress: { address: a.email, name: a.displayName },
        type: a.optional ? "optional" : "required",
      }));
    }

    if (event.visibility !== undefined) {
      graphEvent.sensitivity =
        event.visibility === Visibility.PRIVATE
          ? "private"
          : event.visibility === Visibility.CONFIDENTIAL
          ? "confidential"
          : "normal";
    }

    if (event.reminders !== undefined) {
      const reminderConfig = toGraphReminders(event.reminders);
      graphEvent.isReminderOn = reminderConfig.isReminderOn;
      if (reminderConfig.reminderMinutesBeforeStart !== undefined) {
        graphEvent.reminderMinutesBeforeStart = reminderConfig.reminderMinutesBeforeStart;
      }
    }

    if (event.recurrence !== undefined && event.start?.kind === "timed") {
      graphEvent.recurrence = buildGraphRecurrence(
        event.recurrence,
        event.start.dateTime,
      );
    }

    const response = await client
      .api(`/me/calendars/${calendarId}/events/${eventId}`)
      .patch(graphEvent);

    return this.mapEvent(response, calendarId);
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    const client = await this.ensureInitialized();

    await client
      .api(`/me/calendars/${calendarId}/events/${eventId}`)
      .delete();
  }
}
