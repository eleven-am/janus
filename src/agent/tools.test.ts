import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mock } from "bun:test";
import {
  EventOrderBy,
  SendUpdates,
} from "@/providers/calendar/types.js";

const mockProvider = {
  listCalendars: vi.fn(),
  listEvents: vi.fn(),
  getEvent: vi.fn(),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
};

const mockGetCalendarProvider = vi.fn(() => mockProvider);

vi.mock("ai", () => ({
  tool: (config: any) => ({
    ...config,
    execute: config.execute,
  }),
  zodSchema: (schema: any) => schema,
  streamText: vi.fn(),
  stepCountIs: vi.fn(),
}));

vi.mock("@/lib/logging.js", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logEvent: vi.fn(),
  logDebug: vi.fn(),
}));

vi.mock("@/auth/index.js", () => ({
  auth: { api: { getAccessToken: vi.fn(), getSession: vi.fn() } },
}));

vi.mock("@/config/index.js", () => ({
  config: {
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    ANTHROPIC_API_KEY: "test-key",
    OLLAMA_URL: "http://localhost:11434",
    HU_AGENT_ID: "test-agent-id",
    HU_URL: "wss://test.voice.maix.ovh",
    HU_PRIVATE_KEY_PATH: "/test/private.pem",
  },
}));

const toolOpts = { toolCallId: "t1", messages: [] as any[], abortSignal: undefined as any };
const ctx = { userId: "test-user-123" };

describe("createCalendarTools", () => {
  let tools: any;

  let getCalendarProviderSpy: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const calendarIndex = await import("@/providers/calendar/index.js");
    getCalendarProviderSpy = vi.spyOn(calendarIndex, "getCalendarProvider").mockReturnValue(mockProvider as any);
    const { createCalendarTools } = await import("./tools.js");
    tools = createCalendarTools(ctx);
  });

  afterEach(() => {
    getCalendarProviderSpy?.mockRestore();
  });

  describe("handleToolError (indirect)", () => {
    it("returns NOT_LINKED for Google account not linked", async () => {
      mockProvider.listCalendars.mockRejectedValue(new Error("No Google account linked for user"));

      const result = await tools.list_calendars.execute({}, toolOpts);

      expect(result).toEqual({
        error: true,
        message: "Google Calendar is not connected. Please link your account first.",
        code: "NOT_LINKED",
      });
    });

    it("returns NOT_LINKED for Microsoft account not linked", async () => {
      mockProvider.listCalendars.mockRejectedValue(new Error("No Microsoft account linked for user"));

      const result = await tools.list_calendars.execute({}, toolOpts);

      expect(result).toEqual({
        error: true,
        message: "Outlook Calendar is not connected. Please link your account first.",
        code: "NOT_LINKED",
      });
    });

    it("returns UNSUPPORTED_PROVIDER for not supported yet errors", async () => {
      const errorMsg = "Calendar provider 'apple' is not supported yet";
      mockProvider.listCalendars.mockRejectedValue(new Error(errorMsg));

      const result = await tools.list_calendars.execute({}, toolOpts);

      expect(result).toEqual({
        error: true,
        message: errorMsg,
        code: "UNSUPPORTED_PROVIDER",
      });
    });

    it("returns OPERATION_FAILED for generic errors", async () => {
      mockProvider.listCalendars.mockRejectedValue(new Error("Something went wrong"));

      const result = await tools.list_calendars.execute({}, toolOpts);

      expect(result).toEqual({
        error: true,
        message: "Failed to list_calendars. Please try again.",
        code: "OPERATION_FAILED",
      });
    });

    it("returns OPERATION_FAILED for non-Error thrown values", async () => {
      mockProvider.listCalendars.mockRejectedValue("string error");

      const result = await tools.list_calendars.execute({}, toolOpts);

      expect(result).toEqual({
        error: true,
        message: "Failed to list_calendars. Please try again.",
        code: "OPERATION_FAILED",
      });
    });
  });

  describe("list_calendars", () => {
    it("returns calendar data on success", async () => {
      const calendars = [{ id: "primary", name: "My Calendar", primary: true }];
      mockProvider.listCalendars.mockResolvedValue(calendars);

      const result = await tools.list_calendars.execute({}, toolOpts);

      expect(result).toEqual(calendars);
      expect(mockProvider.listCalendars).toHaveBeenCalledOnce();
    });

    it("returns error object on failure", async () => {
      mockProvider.listCalendars.mockRejectedValue(new Error("Network failure"));

      const result = await tools.list_calendars.execute({}, toolOpts);

      expect(result).toHaveProperty("error", true);
      expect(result).toHaveProperty("code", "OPERATION_FAILED");
    });
  });

  describe("list_events", () => {
    it("maps parameters correctly including Date conversions and defaults", async () => {
      const events = [{ id: "evt1", summary: "Meeting" }];
      mockProvider.listEvents.mockResolvedValue(events);

      const params = {
        calendarId: "primary",
        timeMin: "2024-01-15T00:00:00Z",
        timeMax: "2024-01-16T23:59:59Z",
        maxResults: 10,
        query: "meeting",
      };

      const result = await tools.list_events.execute(params, toolOpts);

      expect(result).toEqual(events);
      expect(mockProvider.listEvents).toHaveBeenCalledWith({
        calendarId: "primary",
        timeMin: new Date("2024-01-15T00:00:00Z"),
        timeMax: new Date("2024-01-16T23:59:59Z"),
        maxResults: 10,
        query: "meeting",
        singleEvents: true,
        orderBy: EventOrderBy.START_TIME,
      });
    });
  });

  describe("create_event", () => {
    const baseParams = {
      calendarId: "primary",
      summary: "Test Event",
      startDateTime: "2024-01-15T14:00:00",
      endDateTime: "2024-01-15T15:00:00",
      timeZone: "Europe/Paris",
    };

    it("maps attendee emails to objects", async () => {
      mockProvider.createEvent.mockResolvedValue({ id: "evt1", summary: "Test Event" });

      await tools.create_event.execute(
        { ...baseParams, attendees: ["alice@example.com", "bob@example.com"] },
        toolOpts,
      );

      const callArgs = mockProvider.createEvent.mock.calls[0][1];
      expect(callArgs.attendees).toEqual([
        { email: "alice@example.com" },
        { email: "bob@example.com" },
      ]);
    });

    it("transforms useDefault reminders to { type: 'default' }", async () => {
      mockProvider.createEvent.mockResolvedValue({ id: "evt1" });

      await tools.create_event.execute(
        { ...baseParams, reminders: { useDefault: true } },
        toolOpts,
      );

      const callArgs = mockProvider.createEvent.mock.calls[0][1];
      expect(callArgs.reminders).toEqual({ type: "default" });
    });

    it("transforms custom reminders with overrides", async () => {
      mockProvider.createEvent.mockResolvedValue({ id: "evt1" });

      await tools.create_event.execute(
        {
          ...baseParams,
          reminders: {
            useDefault: false,
            overrides: [
              { method: "popup", minutes: 10 },
              { method: "email", minutes: 60 },
            ],
          },
        },
        toolOpts,
      );

      const callArgs = mockProvider.createEvent.mock.calls[0][1];
      expect(callArgs.reminders).toEqual({
        type: "custom",
        overrides: [
          { method: "popup", minutes: 10 },
          { method: "email", minutes: 60 },
        ],
      });
    });

    it("transforms recurrence with count end", async () => {
      mockProvider.createEvent.mockResolvedValue({ id: "evt1" });

      await tools.create_event.execute(
        {
          ...baseParams,
          recurrence: { frequency: "weekly", count: 5, byDay: ["MO", "WE", "FR"] },
        },
        toolOpts,
      );

      const callArgs = mockProvider.createEvent.mock.calls[0][1];
      expect(callArgs.recurrence).toEqual({
        frequency: "weekly",
        interval: undefined,
        end: { type: "count", count: 5 },
        byDay: ["MO", "WE", "FR"],
        byMonthDay: undefined,
        byMonth: undefined,
      });
    });

    it("transforms recurrence with until end", async () => {
      mockProvider.createEvent.mockResolvedValue({ id: "evt1" });

      await tools.create_event.execute(
        {
          ...baseParams,
          recurrence: { frequency: "daily", until: "2024-06-01T00:00:00Z" },
        },
        toolOpts,
      );

      const callArgs = mockProvider.createEvent.mock.calls[0][1];
      expect(callArgs.recurrence.end).toEqual({ type: "until", until: "2024-06-01T00:00:00Z" });
    });

    it("transforms recurrence with forever end when no count or until", async () => {
      mockProvider.createEvent.mockResolvedValue({ id: "evt1" });

      await tools.create_event.execute(
        {
          ...baseParams,
          recurrence: { frequency: "monthly", byMonthDay: [1, 15] },
        },
        toolOpts,
      );

      const callArgs = mockProvider.createEvent.mock.calls[0][1];
      expect(callArgs.recurrence.end).toEqual({ type: "forever" });
      expect(callArgs.recurrence.byMonthDay).toEqual([1, 15]);
    });

    it("passes start/end with kind 'timed' and sendUpdates ALL", async () => {
      mockProvider.createEvent.mockResolvedValue({ id: "evt1" });

      await tools.create_event.execute(baseParams, toolOpts);

      const callArgs = mockProvider.createEvent.mock.calls[0][1];
      expect(callArgs.start).toEqual({ kind: "timed", dateTime: "2024-01-15T14:00:00", timeZone: "Europe/Paris" });
      expect(callArgs.end).toEqual({ kind: "timed", dateTime: "2024-01-15T15:00:00", timeZone: "Europe/Paris" });
      expect(callArgs.sendUpdates).toBe(SendUpdates.ALL);
    });
  });

  describe("update_event", () => {
    it("passes undefined for start/end when not provided", async () => {
      mockProvider.updateEvent.mockResolvedValue({ id: "evt1", summary: "Updated" });

      await tools.update_event.execute(
        { calendarId: "primary", eventId: "evt1", summary: "Updated Title" },
        toolOpts,
      );

      const callArgs = mockProvider.updateEvent.mock.calls[0][2];
      expect(callArgs.start).toBeUndefined();
      expect(callArgs.end).toBeUndefined();
      expect(callArgs.summary).toBe("Updated Title");
    });

    it("passes timed start/end when provided", async () => {
      mockProvider.updateEvent.mockResolvedValue({ id: "evt1" });

      await tools.update_event.execute(
        {
          calendarId: "primary",
          eventId: "evt1",
          startDateTime: "2024-02-01T10:00:00",
          endDateTime: "2024-02-01T11:00:00",
          timeZone: "America/New_York",
        },
        toolOpts,
      );

      const callArgs = mockProvider.updateEvent.mock.calls[0][2];
      expect(callArgs.start).toEqual({ kind: "timed", dateTime: "2024-02-01T10:00:00", timeZone: "America/New_York" });
      expect(callArgs.end).toEqual({ kind: "timed", dateTime: "2024-02-01T11:00:00", timeZone: "America/New_York" });
    });
  });

  describe("delete_event", () => {
    it("returns success message on successful deletion", async () => {
      mockProvider.deleteEvent.mockResolvedValue(undefined);

      const result = await tools.delete_event.execute(
        { calendarId: "primary", eventId: "evt-to-delete" },
        toolOpts,
      );

      expect(result).toEqual({
        success: true,
        message: "Event evt-to-delete deleted successfully",
      });
      expect(mockProvider.deleteEvent).toHaveBeenCalledWith("primary", "evt-to-delete");
    });

    it("returns error object on failure", async () => {
      mockProvider.deleteEvent.mockRejectedValue(new Error("Not found"));

      const result = await tools.delete_event.execute(
        { calendarId: "primary", eventId: "evt-missing" },
        toolOpts,
      );

      expect(result).toHaveProperty("error", true);
      expect(result).toHaveProperty("code", "OPERATION_FAILED");
    });
  });
});
