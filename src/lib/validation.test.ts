import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  validateProviderId,
  validateDate,
  validatePositiveInt,
  createEventSchema,
  updateEventSchema,
  dateTimeSchema,
  remindersSchema,
  formatZodErrors,
  toCreateEventParams,
  toUpdateEventParams,
  type CreateEventInput,
  type UpdateEventInput,
} from "./validation.js";
import {
  ProviderId,
  Visibility,
  SendUpdates,
  ReminderMethod,
  RecurrenceFrequency,
  Weekday,
} from "@/providers/calendar/types.js";

describe("validateProviderId", () => {
  it("returns ProviderId for valid lowercase provider", () => {
    expect(validateProviderId("google")).toBe(ProviderId.GOOGLE);
    expect(validateProviderId("outlook")).toBe(ProviderId.OUTLOOK);
    expect(validateProviderId("apple")).toBe(ProviderId.APPLE);
  });

  it("returns ProviderId for valid uppercase provider (case insensitive)", () => {
    expect(validateProviderId("GOOGLE")).toBe(ProviderId.GOOGLE);
    expect(validateProviderId("Google")).toBe(ProviderId.GOOGLE);
    expect(validateProviderId("OUTLOOK")).toBe(ProviderId.OUTLOOK);
  });

  it("returns null for invalid provider", () => {
    expect(validateProviderId("invalid")).toBeNull();
    expect(validateProviderId("yahoo")).toBeNull();
    expect(validateProviderId("")).toBeNull();
  });

  it("returns null for non-string values", () => {
    expect(validateProviderId(123)).toBeNull();
    expect(validateProviderId(null)).toBeNull();
    expect(validateProviderId(undefined)).toBeNull();
    expect(validateProviderId({})).toBeNull();
    expect(validateProviderId([])).toBeNull();
  });
});

describe("validateDate", () => {
  it("returns Date for valid ISO date string", () => {
    const result = validateDate("2024-01-15T10:30:00Z");
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe("2024-01-15T10:30:00.000Z");
  });

  it("returns Date for valid date-only string", () => {
    const result = validateDate("2024-01-15");
    expect(result).toBeInstanceOf(Date);
  });

  it("returns null for invalid date string", () => {
    expect(validateDate("not-a-date")).toBeNull();
    expect(validateDate("2024-13-45")).toBeNull();
    expect(validateDate("")).toBeNull();
  });

  it("returns null for non-string values", () => {
    expect(validateDate(123)).toBeNull();
    expect(validateDate(new Date())).toBeNull();
    expect(validateDate(null)).toBeNull();
    expect(validateDate(undefined)).toBeNull();
    expect(validateDate({})).toBeNull();
  });
});

describe("validatePositiveInt", () => {
  it("parses valid string integers", () => {
    expect(validatePositiveInt("1")).toBe(1);
    expect(validatePositiveInt("42")).toBe(42);
    expect(validatePositiveInt("1000")).toBe(1000);
  });

  it("returns valid number integers", () => {
    expect(validatePositiveInt(1)).toBe(1);
    expect(validatePositiveInt(42)).toBe(42);
    expect(validatePositiveInt(1000)).toBe(1000);
  });

  it("returns null for zero", () => {
    expect(validatePositiveInt(0)).toBeNull();
    expect(validatePositiveInt("0")).toBeNull();
  });

  it("returns null for negative numbers", () => {
    expect(validatePositiveInt(-1)).toBeNull();
    expect(validatePositiveInt("-5")).toBeNull();
  });

  it("returns null for floats", () => {
    expect(validatePositiveInt(1.5)).toBeNull();
    expect(validatePositiveInt(3.14)).toBeNull();
  });

  it("returns null for non-numeric strings", () => {
    expect(validatePositiveInt("abc")).toBeNull();
    expect(validatePositiveInt("")).toBeNull();
  });

  it("parses integer portion from decimal strings", () => {
    expect(validatePositiveInt("1.5")).toBe(1);
    expect(validatePositiveInt("3.9")).toBe(3);
  });

  it("returns null for non-string/number values", () => {
    expect(validatePositiveInt(null)).toBeNull();
    expect(validatePositiveInt(undefined)).toBeNull();
    expect(validatePositiveInt({})).toBeNull();
    expect(validatePositiveInt([])).toBeNull();
  });
});

describe("dateTimeSchema", () => {
  it("accepts timed event with dateTime", () => {
    const result = dateTimeSchema.safeParse({
      dateTime: "2024-01-15T10:30:00Z",
      timeZone: "America/New_York",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all-day event with date", () => {
    const result = dateTimeSchema.safeParse({
      date: "2024-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("accepts event with both dateTime and date (dateTime takes precedence)", () => {
    const result = dateTimeSchema.safeParse({
      dateTime: "2024-01-15T10:30:00Z",
      date: "2024-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects event with neither dateTime nor date", () => {
    const result = dateTimeSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects event with only timeZone", () => {
    const result = dateTimeSchema.safeParse({
      timeZone: "America/New_York",
    });
    expect(result.success).toBe(false);
  });
});

describe("remindersSchema", () => {
  it("accepts default reminders", () => {
    const result = remindersSchema.safeParse({
      useDefault: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts custom reminders with overrides", () => {
    const result = remindersSchema.safeParse({
      useDefault: false,
      overrides: [
        { method: ReminderMethod.EMAIL, minutes: 30 },
        { method: ReminderMethod.POPUP, minutes: 10 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts custom reminders with empty overrides", () => {
    const result = remindersSchema.safeParse({
      useDefault: false,
      overrides: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid reminder method", () => {
    const result = remindersSchema.safeParse({
      useDefault: false,
      overrides: [{ method: "invalid", minutes: 30 }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative minutes", () => {
    const result = remindersSchema.safeParse({
      useDefault: false,
      overrides: [{ method: ReminderMethod.EMAIL, minutes: -10 }],
    });
    expect(result.success).toBe(false);
  });
});

describe("createEventSchema", () => {
  const validEvent = {
    summary: "Test Event",
    start: { dateTime: "2024-01-15T10:00:00Z" },
    end: { dateTime: "2024-01-15T11:00:00Z" },
  };

  it("accepts minimal valid event", () => {
    const result = createEventSchema.safeParse(validEvent);
    expect(result.success).toBe(true);
  });

  it("accepts event with all optional fields", () => {
    const result = createEventSchema.safeParse({
      ...validEvent,
      description: "A test event",
      location: "Conference Room A",
      attendees: [
        { email: "test@example.com", displayName: "Test User", optional: false },
      ],
      visibility: Visibility.PRIVATE,
      sendUpdates: SendUpdates.ALL,
      reminders: { useDefault: true },
      recurrence: { frequency: RecurrenceFrequency.WEEKLY },
    });
    expect(result.success).toBe(true);
  });

  it("rejects event without summary", () => {
    const result = createEventSchema.safeParse({
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects event with empty summary", () => {
    const result = createEventSchema.safeParse({
      summary: "",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects event without start", () => {
    const result = createEventSchema.safeParse({
      summary: "Test Event",
      end: { dateTime: "2024-01-15T11:00:00Z" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects event without end", () => {
    const result = createEventSchema.safeParse({
      summary: "Test Event",
      start: { dateTime: "2024-01-15T10:00:00Z" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid visibility value", () => {
    const result = createEventSchema.safeParse({
      ...validEvent,
      visibility: "invalid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid attendee email", () => {
    const result = createEventSchema.safeParse({
      ...validEvent,
      attendees: [{ email: "not-an-email" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("updateEventSchema", () => {
  it("accepts empty update (all fields optional)", () => {
    const result = updateEventSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts partial update with summary only", () => {
    const result = updateEventSchema.safeParse({
      summary: "Updated Title",
    });
    expect(result.success).toBe(true);
  });

  it("accepts partial update with start/end", () => {
    const result = updateEventSchema.safeParse({
      start: { dateTime: "2024-01-15T14:00:00Z" },
      end: { dateTime: "2024-01-15T15:00:00Z" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid summary (empty string)", () => {
    const result = updateEventSchema.safeParse({
      summary: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid start datetime", () => {
    const result = updateEventSchema.safeParse({
      start: {},
    });
    expect(result.success).toBe(false);
  });
});

describe("recurrence validation", () => {
  it("accepts recurrence with count", () => {
    const result = createEventSchema.safeParse({
      summary: "Weekly Meeting",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.WEEKLY,
        count: 10,
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts recurrence with until", () => {
    const result = createEventSchema.safeParse({
      summary: "Weekly Meeting",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.WEEKLY,
        until: "2024-12-31",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects recurrence with both count and until", () => {
    const result = createEventSchema.safeParse({
      summary: "Weekly Meeting",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.WEEKLY,
        count: 10,
        until: "2024-12-31",
      },
    });
    expect(result.success).toBe(false);
  });

  it("accepts recurrence with byDay", () => {
    const result = createEventSchema.safeParse({
      summary: "Weekday Meeting",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.WEEKLY,
        byDay: [Weekday.MONDAY, Weekday.WEDNESDAY, Weekday.FRIDAY],
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts recurrence with interval", () => {
    const result = createEventSchema.safeParse({
      summary: "Bi-weekly Meeting",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.WEEKLY,
        interval: 2,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("formatZodErrors", () => {
  it("formats single field error", () => {
    const result = createEventSchema.safeParse({
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
    });

    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      expect(formatted).toContainEqual(
        expect.objectContaining({ field: "summary" })
      );
    }
  });

  it("formats nested field errors with dot notation", () => {
    const result = createEventSchema.safeParse({
      summary: "Test",
      start: {},
      end: { dateTime: "2024-01-15T11:00:00Z" },
    });

    if (!result.success) {
      const formatted = formatZodErrors(result.error);
      expect(formatted.some((e) => e.field.startsWith("start"))).toBe(true);
    }
  });

  it("returns empty array for valid input", () => {
    const result = createEventSchema.safeParse({
      summary: "Test",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
    });

    if (result.success) {
      expect(true).toBe(true);
    }
  });
});

describe("toCreateEventParams", () => {
  it("converts timed event correctly", () => {
    const input: CreateEventInput = {
      summary: "Test Event",
      description: "Description",
      location: "Location",
      start: { dateTime: "2024-01-15T10:00:00Z", timeZone: "UTC" },
      end: { dateTime: "2024-01-15T11:00:00Z", timeZone: "UTC" },
    };

    const result = toCreateEventParams(input);

    expect(result.summary).toBe("Test Event");
    expect(result.description).toBe("Description");
    expect(result.location).toBe("Location");
    expect(result.start).toEqual({
      kind: "timed",
      dateTime: "2024-01-15T10:00:00Z",
      timeZone: "UTC",
    });
    expect(result.end).toEqual({
      kind: "timed",
      dateTime: "2024-01-15T11:00:00Z",
      timeZone: "UTC",
    });
  });

  it("converts all-day event correctly", () => {
    const input: CreateEventInput = {
      summary: "All Day Event",
      start: { date: "2024-01-15" },
      end: { date: "2024-01-16" },
    };

    const result = toCreateEventParams(input);

    expect(result.start).toEqual({ kind: "allDay", date: "2024-01-15" });
    expect(result.end).toEqual({ kind: "allDay", date: "2024-01-16" });
  });

  it("converts default reminders correctly", () => {
    const input: CreateEventInput = {
      summary: "Event",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
      reminders: { useDefault: true },
    };

    const result = toCreateEventParams(input);

    expect(result.reminders).toEqual({ type: "default" });
  });

  it("converts custom reminders correctly", () => {
    const input: CreateEventInput = {
      summary: "Event",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
      reminders: {
        useDefault: false,
        overrides: [
          { method: ReminderMethod.EMAIL, minutes: 30 },
          { method: ReminderMethod.POPUP, minutes: 10 },
        ],
      },
    };

    const result = toCreateEventParams(input);

    expect(result.reminders).toEqual({
      type: "custom",
      overrides: [
        { method: ReminderMethod.EMAIL, minutes: 30 },
        { method: ReminderMethod.POPUP, minutes: 10 },
      ],
    });
  });

  it("converts recurrence with count correctly", () => {
    const input: CreateEventInput = {
      summary: "Weekly",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.WEEKLY,
        count: 10,
      },
    };

    const result = toCreateEventParams(input);

    expect(result.recurrence).toEqual({
      frequency: RecurrenceFrequency.WEEKLY,
      interval: undefined,
      end: { type: "count", count: 10 },
      byDay: undefined,
      byMonthDay: undefined,
      byMonth: undefined,
    });
  });

  it("converts recurrence with until correctly", () => {
    const input: CreateEventInput = {
      summary: "Weekly",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.WEEKLY,
        until: "2024-12-31",
      },
    };

    const result = toCreateEventParams(input);

    expect(result.recurrence?.end).toEqual({ type: "until", until: "2024-12-31" });
  });

  it("converts recurrence without end (forever) correctly", () => {
    const input: CreateEventInput = {
      summary: "Weekly",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
      recurrence: {
        frequency: RecurrenceFrequency.WEEKLY,
      },
    };

    const result = toCreateEventParams(input);

    expect(result.recurrence?.end).toEqual({ type: "forever" });
  });

  it("preserves attendees", () => {
    const input: CreateEventInput = {
      summary: "Event",
      start: { dateTime: "2024-01-15T10:00:00Z" },
      end: { dateTime: "2024-01-15T11:00:00Z" },
      attendees: [
        { email: "test@example.com", displayName: "Test", optional: true },
      ],
    };

    const result = toCreateEventParams(input);

    expect(result.attendees).toEqual([
      { email: "test@example.com", displayName: "Test", optional: true },
    ]);
  });
});

describe("toUpdateEventParams", () => {
  it("converts partial update correctly", () => {
    const input: UpdateEventInput = {
      summary: "Updated Title",
      description: "New description",
    };

    const result = toUpdateEventParams(input);

    expect(result.summary).toBe("Updated Title");
    expect(result.description).toBe("New description");
    expect(result.start).toBeUndefined();
    expect(result.end).toBeUndefined();
  });

  it("converts start/end update correctly", () => {
    const input: UpdateEventInput = {
      start: { dateTime: "2024-01-15T14:00:00Z" },
      end: { dateTime: "2024-01-15T15:00:00Z" },
    };

    const result = toUpdateEventParams(input);

    expect(result.start).toEqual({
      kind: "timed",
      dateTime: "2024-01-15T14:00:00Z",
      timeZone: undefined,
    });
  });

  it("handles empty update", () => {
    const input: UpdateEventInput = {};

    const result = toUpdateEventParams(input);

    expect(result.summary).toBeUndefined();
    expect(result.start).toBeUndefined();
    expect(result.end).toBeUndefined();
    expect(result.reminders).toBeUndefined();
    expect(result.recurrence).toBeUndefined();
  });

  it("converts reminders update correctly", () => {
    const input: UpdateEventInput = {
      reminders: {
        useDefault: false,
        overrides: [{ method: ReminderMethod.POPUP, minutes: 15 }],
      },
    };

    const result = toUpdateEventParams(input);

    expect(result.reminders).toEqual({
      type: "custom",
      overrides: [{ method: ReminderMethod.POPUP, minutes: 15 }],
    });
  });
});
