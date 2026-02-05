import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { calendar_v3 } from "googleapis";
import {
  RecurrenceFrequency,
  Weekday,
  Visibility,
  EventStatus,
  ReminderMethod,
  ProviderId,
  toCalendarId,
  toEventId,
  type EventDateTime,
  type EventReminders,
  type RecurrenceRule,
  type CreateEventParams,
} from "./types.js";

vi.mock("@/config/index.js", () => ({
  config: {
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
  },
}));

const mockGetAccessToken = vi.fn();
vi.mock("@/auth/index.js", () => ({
  auth: {
    api: {
      getAccessToken: () => mockGetAccessToken(),
    },
  },
}));

const mockCalendarListList = vi.fn();
const mockCalendarListGet = vi.fn();
const mockEventsList = vi.fn();
const mockEventsGet = vi.fn();
const mockEventsInsert = vi.fn();
const mockEventsPatch = vi.fn();
const mockEventsDelete = vi.fn();

vi.mock("googleapis", () => {
  const MockOAuth2 = class {
    setCredentials = vi.fn();
  };

  return {
    google: {
      auth: {
        OAuth2: MockOAuth2,
      },
      calendar: vi.fn().mockImplementation(() => ({
        calendarList: {
          list: () => mockCalendarListList(),
          get: (params: unknown) => mockCalendarListGet(params),
        },
        events: {
          list: (params: unknown) => mockEventsList(params),
          get: (params: unknown) => mockEventsGet(params),
          insert: (params: unknown) => mockEventsInsert(params),
          patch: (params: unknown) => mockEventsPatch(params),
          delete: (params: unknown) => mockEventsDelete(params),
        },
      })),
    },
  };
});

import { GoogleCalendarProvider } from "./google.js";

describe("GoogleCalendarProvider", () => {
  let provider: GoogleCalendarProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GoogleCalendarProvider("user-123");
    mockGetAccessToken.mockResolvedValue({
      accessToken: "test-token",
      accessTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  });

  describe("providerId", () => {
    it("returns google", () => {
      expect(provider.providerId).toBe(ProviderId.GOOGLE);
    });
  });

  describe("listCalendars", () => {
    it("returns mapped calendars", async () => {
      mockCalendarListList.mockResolvedValue({
        data: {
          items: [
            {
              id: "primary",
              summary: "My Calendar",
              description: "Personal calendar",
              backgroundColor: "#4285f4",
              primary: true,
              accessRole: "owner",
              timeZone: "America/New_York",
            },
            {
              id: "work",
              summary: "Work",
              primary: false,
              accessRole: "writer",
            },
          ],
        },
      });

      const calendars = await provider.listCalendars();

      expect(calendars).toHaveLength(2);
      expect(calendars[0]).toEqual({
        id: toCalendarId("primary"),
        name: "My Calendar",
        description: "Personal calendar",
        color: "#4285f4",
        primary: true,
        accessRole: "owner",
        timeZone: "America/New_York",
      });
      expect(calendars[1]).toEqual({
        id: toCalendarId("work"),
        name: "Work",
        description: undefined,
        color: undefined,
        primary: false,
        accessRole: "writer",
        timeZone: undefined,
      });
    });

    it("handles empty calendar list", async () => {
      mockCalendarListList.mockResolvedValue({ data: { items: [] } });

      const calendars = await provider.listCalendars();
      expect(calendars).toHaveLength(0);
    });

    it("handles missing items array", async () => {
      mockCalendarListList.mockResolvedValue({ data: {} });

      const calendars = await provider.listCalendars();
      expect(calendars).toHaveLength(0);
    });

    it("throws when no access token", async () => {
      mockGetAccessToken.mockResolvedValue(null);

      await expect(provider.listCalendars()).rejects.toThrow(
        "No Google account linked for this user"
      );
    });
  });

  describe("getCalendar", () => {
    it("returns mapped calendar", async () => {
      mockCalendarListGet.mockResolvedValue({
        data: {
          id: "calendar-123",
          summary: "Test Calendar",
          primary: false,
          accessRole: "reader",
        },
      });

      const calendar = await provider.getCalendar("calendar-123");

      expect(calendar.id).toBe("calendar-123");
      expect(calendar.name).toBe("Test Calendar");
      expect(mockCalendarListGet).toHaveBeenCalledWith({
        calendarId: "calendar-123",
      });
    });
  });

  describe("listEvents", () => {
    it("returns mapped events with all parameters", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: "event-1",
              summary: "Meeting",
              description: "Team sync",
              location: "Room A",
              start: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
              end: { dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
              status: "confirmed",
              visibility: "default",
              htmlLink: "https://calendar.google.com/event?id=event-1",
              created: "2024-01-01T00:00:00Z",
              updated: "2024-01-10T00:00:00Z",
              reminders: { useDefault: true },
            },
          ],
        },
      });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
        timeMin: new Date("2024-01-01"),
        timeMax: new Date("2024-02-01"),
        maxResults: 10,
        query: "meeting",
        singleEvents: true,
        orderBy: "startTime",
      });

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        id: toEventId("event-1"),
        calendarId: toCalendarId("primary"),
        summary: "Meeting",
        description: "Team sync",
        location: "Room A",
        status: EventStatus.CONFIRMED,
        visibility: Visibility.DEFAULT,
      });
      expect(events[0].start).toEqual({
        kind: "timed",
        dateTime: "2024-01-15T10:00:00Z",
        timeZone: "UTC",
      });
    });

    it("maps all-day events correctly", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: "event-2",
              summary: "Holiday",
              start: { date: "2024-01-15" },
              end: { date: "2024-01-16" },
              status: "confirmed",
            },
          ],
        },
      });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].start).toEqual({ kind: "allDay", date: "2024-01-15" });
      expect(events[0].end).toEqual({ kind: "allDay", date: "2024-01-16" });
    });

    it("maps attendees correctly", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: "event-3",
              summary: "Team Meeting",
              start: { dateTime: "2024-01-15T10:00:00Z" },
              end: { dateTime: "2024-01-15T11:00:00Z" },
              status: "confirmed",
              attendees: [
                {
                  email: "alice@example.com",
                  displayName: "Alice",
                  responseStatus: "accepted",
                  optional: false,
                  organizer: true,
                  self: false,
                },
                {
                  email: "bob@example.com",
                  responseStatus: "tentative",
                  optional: true,
                },
              ],
              organizer: {
                email: "alice@example.com",
                displayName: "Alice",
                self: true,
              },
            },
          ],
        },
      });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].attendees).toHaveLength(2);
      expect(events[0].attendees![0]).toEqual({
        email: "alice@example.com",
        displayName: "Alice",
        responseStatus: "accepted",
        optional: false,
        organizer: true,
        self: false,
      });
      expect(events[0].organizer).toEqual({
        email: "alice@example.com",
        displayName: "Alice",
        self: true,
      });
    });

    it("maps custom reminders correctly", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: "event-4",
              summary: "Reminder Test",
              start: { dateTime: "2024-01-15T10:00:00Z" },
              end: { dateTime: "2024-01-15T11:00:00Z" },
              status: "confirmed",
              reminders: {
                useDefault: false,
                overrides: [
                  { method: "email", minutes: 30 },
                  { method: "popup", minutes: 10 },
                ],
              },
            },
          ],
        },
      });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].reminders).toEqual({
        type: "custom",
        overrides: [
          { method: "email", minutes: 30 },
          { method: "popup", minutes: 10 },
        ],
      });
    });

    it("maps recurrence correctly", async () => {
      mockEventsList.mockResolvedValue({
        data: {
          items: [
            {
              id: "event-5",
              summary: "Weekly Meeting",
              start: { dateTime: "2024-01-15T10:00:00Z" },
              end: { dateTime: "2024-01-15T11:00:00Z" },
              status: "confirmed",
              recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"],
              recurringEventId: "master-event-id",
            },
          ],
        },
      });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].recurrence).toEqual(["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"]);
      expect(events[0].recurringEventId).toBe("master-event-id");
    });
  });

  describe("getEvent", () => {
    it("returns single event", async () => {
      mockEventsGet.mockResolvedValue({
        data: {
          id: "event-123",
          summary: "Single Event",
          start: { dateTime: "2024-01-15T10:00:00Z" },
          end: { dateTime: "2024-01-15T11:00:00Z" },
          status: "confirmed",
        },
      });

      const event = await provider.getEvent("primary", "event-123");

      expect(event.id).toBe("event-123");
      expect(event.summary).toBe("Single Event");
      expect(mockEventsGet).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "event-123",
      });
    });
  });

  describe("createEvent", () => {
    it("creates timed event with all options", async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "new-event-id",
          summary: "New Meeting",
          start: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
          status: "confirmed",
        },
      });

      const params: CreateEventParams = {
        summary: "New Meeting",
        description: "Important meeting",
        location: "Conference Room",
        start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
        end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
        attendees: [{ email: "test@example.com", displayName: "Test", optional: false }],
        visibility: Visibility.PRIVATE,
        sendUpdates: "all",
        reminders: { type: "default" },
      };

      const event = await provider.createEvent("primary", params);

      expect(event.id).toBe("new-event-id");
      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          sendUpdates: "all",
          requestBody: expect.objectContaining({
            summary: "New Meeting",
            description: "Important meeting",
            location: "Conference Room",
            visibility: Visibility.PRIVATE,
          }),
        })
      );
    });

    it("creates all-day event", async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "allday-event",
          summary: "Holiday",
          start: { date: "2024-01-15" },
          end: { date: "2024-01-16" },
          status: "confirmed",
        },
      });

      const params: CreateEventParams = {
        summary: "Holiday",
        start: { kind: "allDay", date: "2024-01-15" },
        end: { kind: "allDay", date: "2024-01-16" },
      };

      await provider.createEvent("primary", params);

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            start: { date: "2024-01-15" },
            end: { date: "2024-01-16" },
          }),
        })
      );
    });

    it("creates event with recurrence", async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "recurring-event",
          summary: "Weekly Sync",
          start: { dateTime: "2024-01-15T10:00:00Z" },
          end: { dateTime: "2024-01-15T11:00:00Z" },
          status: "confirmed",
          recurrence: ["RRULE:FREQ=WEEKLY;COUNT=10"],
        },
      });

      const params: CreateEventParams = {
        summary: "Weekly Sync",
        start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
        end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
        recurrence: {
          frequency: RecurrenceFrequency.WEEKLY,
          end: { type: "count", count: 10 },
        },
      };

      await provider.createEvent("primary", params);

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            recurrence: ["RRULE:FREQ=WEEKLY;COUNT=10"],
          }),
        })
      );
    });

    it("creates event with custom reminders", async () => {
      mockEventsInsert.mockResolvedValue({
        data: {
          id: "reminder-event",
          summary: "Reminder Test",
          start: { dateTime: "2024-01-15T10:00:00Z" },
          end: { dateTime: "2024-01-15T11:00:00Z" },
          status: "confirmed",
        },
      });

      const params: CreateEventParams = {
        summary: "Reminder Test",
        start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
        end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
        reminders: {
          type: "custom",
          overrides: [
            { method: ReminderMethod.EMAIL, minutes: 30 },
            { method: ReminderMethod.POPUP, minutes: 10 },
          ],
        },
      };

      await provider.createEvent("primary", params);

      expect(mockEventsInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            reminders: {
              useDefault: false,
              overrides: [
                { method: "email", minutes: 30 },
                { method: "popup", minutes: 10 },
              ],
            },
          }),
        })
      );
    });
  });

  describe("updateEvent", () => {
    it("updates event with partial data", async () => {
      mockEventsPatch.mockResolvedValue({
        data: {
          id: "event-to-update",
          summary: "Updated Title",
          start: { dateTime: "2024-01-15T10:00:00Z" },
          end: { dateTime: "2024-01-15T11:00:00Z" },
          status: "confirmed",
        },
      });

      const event = await provider.updateEvent("primary", "event-to-update", {
        summary: "Updated Title",
        description: "New description",
      });

      expect(event.summary).toBe("Updated Title");
      expect(mockEventsPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          calendarId: "primary",
          eventId: "event-to-update",
          requestBody: expect.objectContaining({
            summary: "Updated Title",
            description: "New description",
          }),
        })
      );
    });

    it("updates event times", async () => {
      mockEventsPatch.mockResolvedValue({
        data: {
          id: "event-to-update",
          summary: "Event",
          start: { dateTime: "2024-01-15T14:00:00Z" },
          end: { dateTime: "2024-01-15T15:00:00Z" },
          status: "confirmed",
        },
      });

      await provider.updateEvent("primary", "event-to-update", {
        start: { kind: "timed", dateTime: "2024-01-15T14:00:00Z", timeZone: "UTC" },
        end: { kind: "timed", dateTime: "2024-01-15T15:00:00Z", timeZone: "UTC" },
      });

      expect(mockEventsPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          requestBody: expect.objectContaining({
            start: { dateTime: "2024-01-15T14:00:00Z", timeZone: "UTC" },
            end: { dateTime: "2024-01-15T15:00:00Z", timeZone: "UTC" },
          }),
        })
      );
    });
  });

  describe("deleteEvent", () => {
    it("deletes event", async () => {
      mockEventsDelete.mockResolvedValue({});

      await provider.deleteEvent("primary", "event-to-delete");

      expect(mockEventsDelete).toHaveBeenCalledWith({
        calendarId: "primary",
        eventId: "event-to-delete",
      });
    });
  });

  describe("token caching", () => {
    it("reuses cached token within expiry window", async () => {
      mockCalendarListList.mockResolvedValue({ data: { items: [] } });

      await provider.listCalendars();
      await provider.listCalendars();
      await provider.listCalendars();

      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    });

    it("refreshes token when expired", async () => {
      mockGetAccessToken.mockResolvedValueOnce({
        accessToken: "token-1",
        accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
      });
      mockGetAccessToken.mockResolvedValueOnce({
        accessToken: "token-2",
        accessTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
      });
      mockCalendarListList.mockResolvedValue({ data: { items: [] } });

      await provider.listCalendars();
      await provider.listCalendars();

      expect(mockGetAccessToken).toHaveBeenCalledTimes(2);
    });
  });
});

describe("buildRruleString (via createEvent)", () => {
  let provider: GoogleCalendarProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GoogleCalendarProvider("user-123");
    mockGetAccessToken.mockResolvedValue({
      accessToken: "test-token",
      accessTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    mockEventsInsert.mockResolvedValue({
      data: {
        id: "test-event",
        summary: "Test",
        start: { dateTime: "2024-01-15T10:00:00Z" },
        end: { dateTime: "2024-01-15T11:00:00Z" },
        status: "confirmed",
      },
    });
  });

  it("builds daily recurrence", async () => {
    await provider.createEvent("primary", {
      summary: "Daily",
      start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
      end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
      recurrence: { frequency: RecurrenceFrequency.DAILY },
    });

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          recurrence: ["RRULE:FREQ=DAILY"],
        }),
      })
    );
  });

  it("builds weekly recurrence with interval", async () => {
    await provider.createEvent("primary", {
      summary: "Bi-weekly",
      start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
      end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
      recurrence: { frequency: RecurrenceFrequency.WEEKLY, interval: 2 },
    });

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          recurrence: ["RRULE:FREQ=WEEKLY;INTERVAL=2"],
        }),
      })
    );
  });

  it("builds recurrence with count", async () => {
    await provider.createEvent("primary", {
      summary: "Limited",
      start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
      end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.WEEKLY,
        end: { type: "count", count: 10 },
      },
    });

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          recurrence: ["RRULE:FREQ=WEEKLY;COUNT=10"],
        }),
      })
    );
  });

  it("builds recurrence with until date", async () => {
    await provider.createEvent("primary", {
      summary: "Until Date",
      start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
      end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.MONTHLY,
        end: { type: "until", until: "2024-12-31" },
      },
    });

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          recurrence: ["RRULE:FREQ=MONTHLY;UNTIL=20241231"],
        }),
      })
    );
  });

  it("builds recurrence with byDay", async () => {
    await provider.createEvent("primary", {
      summary: "Weekdays",
      start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
      end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.WEEKLY,
        byDay: [Weekday.MONDAY, Weekday.WEDNESDAY, Weekday.FRIDAY],
      },
    });

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          recurrence: ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"],
        }),
      })
    );
  });

  it("builds recurrence with byMonthDay", async () => {
    await provider.createEvent("primary", {
      summary: "Monthly on 15th",
      start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
      end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.MONTHLY,
        byMonthDay: [15],
      },
    });

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          recurrence: ["RRULE:FREQ=MONTHLY;BYMONTHDAY=15"],
        }),
      })
    );
  });

  it("builds recurrence with byMonth", async () => {
    await provider.createEvent("primary", {
      summary: "Yearly in Jan",
      start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
      end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.YEARLY,
        byMonth: [1, 7],
      },
    });

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          recurrence: ["RRULE:FREQ=YEARLY;BYMONTH=1,7"],
        }),
      })
    );
  });

  it("builds complex recurrence with multiple parts", async () => {
    await provider.createEvent("primary", {
      summary: "Complex",
      start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
      end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 2,
        byDay: [Weekday.MONDAY, Weekday.FRIDAY],
        end: { type: "count", count: 20 },
      },
    });

    expect(mockEventsInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        requestBody: expect.objectContaining({
          recurrence: ["RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=20;BYDAY=MO,FR"],
        }),
      })
    );
  });
});
