import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Calendar as GraphCalendar, Event as GraphEvent } from "@microsoft/microsoft-graph-types";
import {
  RecurrenceFrequency,
  Weekday,
  Visibility,
  EventStatus,
  AccessRole,
  ReminderMethod,
  ProviderId,
  toCalendarId,
  toEventId,
  type CreateEventParams,
  type UpdateEventParams,
} from "./types.js";

const mockGetAccessToken = vi.fn();
vi.mock("@/auth/index.js", () => ({
  auth: {
    api: {
      getAccessToken: () => mockGetAccessToken(),
    },
  },
}));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();
const mockApiPatch = vi.fn();
const mockApiDelete = vi.fn();
const mockApiFilter = vi.fn();
const mockApiTop = vi.fn();
const mockApiSearch = vi.fn();
const mockApiOrderby = vi.fn();

const createMockRequest = () => ({
  get: mockApiGet,
  post: mockApiPost,
  patch: mockApiPatch,
  delete: mockApiDelete,
  filter: vi.fn().mockReturnThis(),
  top: vi.fn().mockReturnThis(),
  search: vi.fn().mockReturnThis(),
  orderby: vi.fn().mockReturnThis(),
});

const mockApi = vi.fn();

vi.mock("@microsoft/microsoft-graph-client", () => ({
  Client: {
    init: vi.fn().mockImplementation(() => ({
      api: (path: string) => {
        const request = createMockRequest();
        mockApi(path);
        return request;
      },
    })),
  },
}));

import { OutlookCalendarProvider } from "./outlook.js";

describe("OutlookCalendarProvider", () => {
  let provider: OutlookCalendarProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OutlookCalendarProvider("user-123");
    mockGetAccessToken.mockResolvedValue({
      accessToken: "test-token",
      accessTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  });

  describe("providerId", () => {
    it("returns outlook", () => {
      expect(provider.providerId).toBe(ProviderId.OUTLOOK);
    });
  });

  describe("listCalendars", () => {
    it("returns mapped calendars", async () => {
      const graphCalendars: GraphCalendar[] = [
        {
          id: "cal-1",
          name: "Calendar",
          hexColor: "#0078d4",
          isDefaultCalendar: true,
          canEdit: true,
        },
        {
          id: "cal-2",
          name: "Work",
          isDefaultCalendar: false,
          canEdit: false,
        },
      ];

      mockApiGet.mockResolvedValue({ value: graphCalendars });

      const calendars = await provider.listCalendars();

      expect(calendars).toHaveLength(2);
      expect(calendars[0]).toEqual({
        id: toCalendarId("cal-1"),
        name: "Calendar",
        description: undefined,
        color: "#0078d4",
        primary: true,
        accessRole: AccessRole.OWNER,
        timeZone: undefined,
      });
      expect(calendars[1]).toEqual({
        id: toCalendarId("cal-2"),
        name: "Work",
        description: undefined,
        color: undefined,
        primary: false,
        accessRole: AccessRole.READER,
        timeZone: undefined,
      });
      expect(mockApi).toHaveBeenCalledWith("/me/calendars");
    });

    it("handles empty calendar list", async () => {
      mockApiGet.mockResolvedValue({ value: [] });

      const calendars = await provider.listCalendars();
      expect(calendars).toHaveLength(0);
    });

    it("throws when no access token", async () => {
      mockGetAccessToken.mockResolvedValue(null);

      await expect(provider.listCalendars()).rejects.toThrow(
        "No Microsoft account linked for this user"
      );
    });
  });

  describe("getCalendar", () => {
    it("returns mapped calendar", async () => {
      mockApiGet.mockResolvedValue({
        id: "calendar-123",
        name: "Test Calendar",
        isDefaultCalendar: false,
        canEdit: true,
      } as GraphCalendar);

      const calendar = await provider.getCalendar("calendar-123");

      expect(calendar.id).toBe("calendar-123");
      expect(calendar.name).toBe("Test Calendar");
      expect(calendar.accessRole).toBe(AccessRole.OWNER);
      expect(mockApi).toHaveBeenCalledWith("/me/calendars/calendar-123");
    });
  });

  describe("listEvents", () => {
    it("returns mapped events", async () => {
      const graphEvents: GraphEvent[] = [
        {
          id: "event-1",
          subject: "Meeting",
          bodyPreview: "Team sync",
          location: { displayName: "Room A" },
          start: { dateTime: "2024-01-15T10:00:00", timeZone: "UTC" },
          end: { dateTime: "2024-01-15T11:00:00", timeZone: "UTC" },
          isAllDay: false,
          showAs: "busy",
          isCancelled: false,
          sensitivity: "normal",
          webLink: "https://outlook.office.com/calendar/item/event-1",
          createdDateTime: "2024-01-01T00:00:00Z",
          lastModifiedDateTime: "2024-01-10T00:00:00Z",
          isReminderOn: true,
          reminderMinutesBeforeStart: 15,
        },
      ];

      mockApiGet.mockResolvedValue({ value: graphEvents });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
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
        dateTime: "2024-01-15T10:00:00",
        timeZone: "UTC",
      });
      expect(events[0].reminders).toEqual({
        type: "custom",
        overrides: [{ method: "popup", minutes: 15 }],
      });
    });

    it("maps all-day events correctly", async () => {
      const graphEvents: GraphEvent[] = [
        {
          id: "event-2",
          subject: "Holiday",
          start: { dateTime: "2024-01-15T00:00:00", timeZone: "UTC" },
          end: { dateTime: "2024-01-16T00:00:00", timeZone: "UTC" },
          isAllDay: true,
          showAs: "free",
          isCancelled: false,
        },
      ];

      mockApiGet.mockResolvedValue({ value: graphEvents });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].start).toEqual({ kind: "allDay", date: "2024-01-15" });
      expect(events[0].end).toEqual({ kind: "allDay", date: "2024-01-16" });
    });

    it("maps cancelled events correctly", async () => {
      const graphEvents: GraphEvent[] = [
        {
          id: "event-3",
          subject: "Cancelled Meeting",
          start: { dateTime: "2024-01-15T10:00:00" },
          end: { dateTime: "2024-01-15T11:00:00" },
          isAllDay: false,
          isCancelled: true,
          showAs: "busy",
        },
      ];

      mockApiGet.mockResolvedValue({ value: graphEvents });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].status).toBe(EventStatus.CANCELLED);
    });

    it("maps sensitivity to visibility correctly", async () => {
      const testCases = [
        { sensitivity: "normal", expected: Visibility.DEFAULT },
        { sensitivity: "personal", expected: Visibility.PRIVATE },
        { sensitivity: "private", expected: Visibility.PRIVATE },
        { sensitivity: "confidential", expected: Visibility.CONFIDENTIAL },
      ];

      for (const { sensitivity, expected } of testCases) {
        mockApiGet.mockResolvedValue({
          value: [
            {
              id: "event",
              subject: "Test",
              start: { dateTime: "2024-01-15T10:00:00" },
              end: { dateTime: "2024-01-15T11:00:00" },
              isAllDay: false,
              isCancelled: false,
              sensitivity,
            },
          ],
        });

        const events = await provider.listEvents({
          calendarId: toCalendarId("primary"),
        });

        expect(events[0].visibility).toBe(expected);
      }
    });

    it("maps attendees correctly", async () => {
      const graphEvents: GraphEvent[] = [
        {
          id: "event-4",
          subject: "Team Meeting",
          start: { dateTime: "2024-01-15T10:00:00" },
          end: { dateTime: "2024-01-15T11:00:00" },
          isAllDay: false,
          isCancelled: false,
          attendees: [
            {
              emailAddress: { address: "alice@example.com", name: "Alice" },
              type: "required",
              status: { response: "accepted" },
            },
            {
              emailAddress: { address: "bob@example.com", name: "Bob" },
              type: "optional",
              status: { response: "tentativelyAccepted" },
            },
          ],
          organizer: {
            emailAddress: { address: "alice@example.com", name: "Alice" },
          },
          isOrganizer: true,
        },
      ];

      mockApiGet.mockResolvedValue({ value: graphEvents });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].attendees).toHaveLength(2);
      expect(events[0].attendees![0]).toEqual({
        email: "alice@example.com",
        displayName: "Alice",
        responseStatus: "accepted",
        optional: false,
        organizer: false,
        self: false,
      });
      expect(events[0].attendees![1].responseStatus).toBe("tentative");
      expect(events[0].attendees![1].optional).toBe(true);
      expect(events[0].organizer).toEqual({
        email: "alice@example.com",
        displayName: "Alice",
        self: true,
      });
    });

    it("maps recurrence correctly", async () => {
      const graphEvents: GraphEvent[] = [
        {
          id: "event-5",
          subject: "Weekly Meeting",
          start: { dateTime: "2024-01-15T10:00:00" },
          end: { dateTime: "2024-01-15T11:00:00" },
          isAllDay: false,
          isCancelled: false,
          recurrence: {
            pattern: {
              type: "weekly",
              interval: 1,
              daysOfWeek: ["monday", "wednesday", "friday"],
            },
            range: {
              type: "endDate",
              startDate: "2024-01-15",
              endDate: "2024-12-31",
            },
          },
          seriesMasterId: "master-id",
        },
      ];

      mockApiGet.mockResolvedValue({ value: graphEvents });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].recurrence).toBeDefined();
      expect(events[0].recurrence![0]).toContain("FREQ=WEEKLY");
      expect(events[0].recurrence![0]).toContain("BYDAY=MO,WE,FR");
      expect(events[0].recurrence![0]).toContain("UNTIL=20241231");
      expect(events[0].recurringEventId).toBe("master-id");
    });

    it("maps recurrence with count correctly", async () => {
      const graphEvents: GraphEvent[] = [
        {
          id: "event-6",
          subject: "Limited Series",
          start: { dateTime: "2024-01-15T10:00:00" },
          end: { dateTime: "2024-01-15T11:00:00" },
          isAllDay: false,
          isCancelled: false,
          recurrence: {
            pattern: {
              type: "daily",
              interval: 1,
            },
            range: {
              type: "numbered",
              startDate: "2024-01-15",
              numberOfOccurrences: 10,
            },
          },
        },
      ];

      mockApiGet.mockResolvedValue({ value: graphEvents });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].recurrence![0]).toContain("FREQ=DAILY");
      expect(events[0].recurrence![0]).toContain("COUNT=10");
    });

    it("maps monthly recurrence patterns", async () => {
      const graphEvents: GraphEvent[] = [
        {
          id: "event-7",
          subject: "Monthly on 15th",
          start: { dateTime: "2024-01-15T10:00:00" },
          end: { dateTime: "2024-01-15T11:00:00" },
          isAllDay: false,
          isCancelled: false,
          recurrence: {
            pattern: {
              type: "absoluteMonthly",
              interval: 1,
              dayOfMonth: 15,
            },
            range: {
              type: "noEnd",
              startDate: "2024-01-15",
            },
          },
        },
      ];

      mockApiGet.mockResolvedValue({ value: graphEvents });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].recurrence![0]).toContain("FREQ=MONTHLY");
      expect(events[0].recurrence![0]).toContain("BYMONTHDAY=15");
    });

    it("maps yearly recurrence patterns", async () => {
      const graphEvents: GraphEvent[] = [
        {
          id: "event-8",
          subject: "Annual Review",
          start: { dateTime: "2024-01-15T10:00:00" },
          end: { dateTime: "2024-01-15T11:00:00" },
          isAllDay: false,
          isCancelled: false,
          recurrence: {
            pattern: {
              type: "absoluteYearly",
              interval: 1,
              month: 1,
              dayOfMonth: 15,
            },
            range: {
              type: "noEnd",
              startDate: "2024-01-15",
            },
          },
        },
      ];

      mockApiGet.mockResolvedValue({ value: graphEvents });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].recurrence![0]).toContain("FREQ=YEARLY");
      expect(events[0].recurrence![0]).toContain("BYMONTH=1");
    });
  });

  describe("getEvent", () => {
    it("returns single event", async () => {
      mockApiGet.mockResolvedValue({
        id: "event-123",
        subject: "Single Event",
        start: { dateTime: "2024-01-15T10:00:00" },
        end: { dateTime: "2024-01-15T11:00:00" },
        isAllDay: false,
        isCancelled: false,
      } as GraphEvent);

      const event = await provider.getEvent("primary", "event-123");

      expect(event.id).toBe("event-123");
      expect(event.summary).toBe("Single Event");
      expect(mockApi).toHaveBeenCalledWith("/me/calendars/primary/events/event-123");
    });
  });

  describe("createEvent", () => {
    it("creates timed event with all options", async () => {
      mockApiPost.mockResolvedValue({
        id: "new-event-id",
        subject: "New Meeting",
        start: { dateTime: "2024-01-15T10:00:00", timeZone: "UTC" },
        end: { dateTime: "2024-01-15T11:00:00", timeZone: "UTC" },
        isAllDay: false,
        isCancelled: false,
      } as GraphEvent);

      const params: CreateEventParams = {
        summary: "New Meeting",
        description: "Important meeting",
        location: "Conference Room",
        start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
        end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
        attendees: [{ email: "test@example.com", displayName: "Test", optional: false }],
        visibility: Visibility.PRIVATE,
        reminders: {
          type: "custom",
          overrides: [{ method: ReminderMethod.POPUP, minutes: 15 }],
        },
      };

      const event = await provider.createEvent("primary", params);

      expect(event.id).toBe("new-event-id");
      expect(mockApiPost).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "New Meeting",
          body: { contentType: "text", content: "Important meeting" },
          location: { displayName: "Conference Room" },
          sensitivity: "private",
          isReminderOn: true,
          reminderMinutesBeforeStart: 15,
        })
      );
    });

    it("creates all-day event", async () => {
      mockApiPost.mockResolvedValue({
        id: "allday-event",
        subject: "Holiday",
        start: { dateTime: "2024-01-15" },
        end: { dateTime: "2024-01-16" },
        isAllDay: true,
        isCancelled: false,
      } as GraphEvent);

      const params: CreateEventParams = {
        summary: "Holiday",
        start: { kind: "allDay", date: "2024-01-15" },
        end: { kind: "allDay", date: "2024-01-16" },
      };

      await provider.createEvent("primary", params);

      expect(mockApiPost).toHaveBeenCalledWith(
        expect.objectContaining({
          isAllDay: true,
        })
      );
    });

    it("creates event with recurrence", async () => {
      mockApiPost.mockResolvedValue({
        id: "recurring-event",
        subject: "Weekly Sync",
        start: { dateTime: "2024-01-15T10:00:00" },
        end: { dateTime: "2024-01-15T11:00:00" },
        isAllDay: false,
        isCancelled: false,
      } as GraphEvent);

      const params: CreateEventParams = {
        summary: "Weekly Sync",
        start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
        end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
        recurrence: {
          frequency: RecurrenceFrequency.WEEKLY,
          byDay: [Weekday.MONDAY, Weekday.FRIDAY],
          end: { type: "count", count: 10 },
        },
      };

      await provider.createEvent("primary", params);

      expect(mockApiPost).toHaveBeenCalledWith(
        expect.objectContaining({
          recurrence: expect.objectContaining({
            pattern: expect.objectContaining({
              type: "weekly",
              interval: 1,
              daysOfWeek: ["monday", "friday"],
            }),
            range: expect.objectContaining({
              type: "numbered",
              numberOfOccurrences: 10,
            }),
          }),
        })
      );
    });

    it("maps visibility to sensitivity correctly", async () => {
      mockApiPost.mockResolvedValue({
        id: "event",
        subject: "Test",
        start: { dateTime: "2024-01-15T10:00:00" },
        end: { dateTime: "2024-01-15T11:00:00" },
        isAllDay: false,
        isCancelled: false,
      } as GraphEvent);

      const testCases = [
        { visibility: Visibility.PRIVATE, expected: "private" },
        { visibility: Visibility.CONFIDENTIAL, expected: "confidential" },
        { visibility: Visibility.DEFAULT, expected: "normal" },
        { visibility: Visibility.PUBLIC, expected: "normal" },
      ];

      for (const { visibility, expected } of testCases) {
        await provider.createEvent("primary", {
          summary: "Test",
          start: { kind: "timed", dateTime: "2024-01-15T10:00:00Z" },
          end: { kind: "timed", dateTime: "2024-01-15T11:00:00Z" },
          visibility,
        });

        expect(mockApiPost).toHaveBeenCalledWith(
          expect.objectContaining({
            sensitivity: expected,
          })
        );
      }
    });
  });

  describe("updateEvent", () => {
    it("updates event with partial data", async () => {
      mockApiPatch.mockResolvedValue({
        id: "event-to-update",
        subject: "Updated Title",
        start: { dateTime: "2024-01-15T10:00:00" },
        end: { dateTime: "2024-01-15T11:00:00" },
        isAllDay: false,
        isCancelled: false,
      } as GraphEvent);

      const event = await provider.updateEvent("primary", "event-to-update", {
        summary: "Updated Title",
        description: "New description",
      });

      expect(event.summary).toBe("Updated Title");
      expect(mockApiPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: "Updated Title",
          body: { contentType: "text", content: "New description" },
        })
      );
    });

    it("updates event times", async () => {
      mockApiPatch.mockResolvedValue({
        id: "event-to-update",
        subject: "Event",
        start: { dateTime: "2024-01-15T14:00:00" },
        end: { dateTime: "2024-01-15T15:00:00" },
        isAllDay: false,
        isCancelled: false,
      } as GraphEvent);

      await provider.updateEvent("primary", "event-to-update", {
        start: { kind: "timed", dateTime: "2024-01-15T14:00:00Z", timeZone: "UTC" },
        end: { kind: "timed", dateTime: "2024-01-15T15:00:00Z", timeZone: "UTC" },
      });

      expect(mockApiPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          start: { dateTime: "2024-01-15T14:00:00Z", timeZone: "UTC" },
          end: { dateTime: "2024-01-15T15:00:00Z", timeZone: "UTC" },
          isAllDay: false,
        })
      );
    });

    it("updates attendees", async () => {
      mockApiPatch.mockResolvedValue({
        id: "event",
        subject: "Meeting",
        start: { dateTime: "2024-01-15T10:00:00" },
        end: { dateTime: "2024-01-15T11:00:00" },
        isAllDay: false,
        isCancelled: false,
      } as GraphEvent);

      await provider.updateEvent("primary", "event", {
        attendees: [
          { email: "new@example.com", displayName: "New Person", optional: true },
        ],
      });

      expect(mockApiPatch).toHaveBeenCalledWith(
        expect.objectContaining({
          attendees: [
            {
              emailAddress: { address: "new@example.com", name: "New Person" },
              type: "optional",
            },
          ],
        })
      );
    });
  });

  describe("deleteEvent", () => {
    it("deletes event", async () => {
      mockApiDelete.mockResolvedValue({});

      await provider.deleteEvent("primary", "event-to-delete");

      expect(mockApi).toHaveBeenCalledWith("/me/calendars/primary/events/event-to-delete");
      expect(mockApiDelete).toHaveBeenCalled();
    });
  });

  describe("token caching", () => {
    it("reuses cached token within expiry window", async () => {
      mockApiGet.mockResolvedValue({ value: [] });

      await provider.listCalendars();
      await provider.listCalendars();
      await provider.listCalendars();

      expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    });
  });
});

describe("response status mapping", () => {
  let provider: OutlookCalendarProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OutlookCalendarProvider("user-123");
    mockGetAccessToken.mockResolvedValue({
      accessToken: "test-token",
      accessTokenExpiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  });

  it("maps all response statuses correctly", async () => {
    const statusMappings = [
      { graphStatus: "none", expected: "needsAction" },
      { graphStatus: "notResponded", expected: "needsAction" },
      { graphStatus: "organizer", expected: "accepted" },
      { graphStatus: "tentativelyAccepted", expected: "tentative" },
      { graphStatus: "accepted", expected: "accepted" },
      { graphStatus: "declined", expected: "declined" },
    ];

    for (const { graphStatus, expected } of statusMappings) {
      mockApiGet.mockResolvedValue({
        value: [
          {
            id: "event",
            subject: "Test",
            start: { dateTime: "2024-01-15T10:00:00" },
            end: { dateTime: "2024-01-15T11:00:00" },
            isAllDay: false,
            isCancelled: false,
            attendees: [
              {
                emailAddress: { address: "test@example.com" },
                status: { response: graphStatus },
              },
            ],
          },
        ],
      });

      const events = await provider.listEvents({
        calendarId: toCalendarId("primary"),
      });

      expect(events[0].attendees![0].responseStatus).toBe(expected);
    }
  });
});
