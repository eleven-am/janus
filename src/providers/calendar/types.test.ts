import { describe, it, expect } from "vitest";
import {
  toCalendarId,
  toEventId,
  toUserId,
  ProviderId,
  AccessRole,
  ResponseStatus,
  EventStatus,
  Visibility,
  EventOrderBy,
  SendUpdates,
  ReminderMethod,
  RecurrenceFrequency,
  Weekday,
  type CalendarId,
  type EventId,
  type UserId,
} from "./types.js";

describe("branded types", () => {
  describe("toCalendarId", () => {
    it("returns the input string as CalendarId", () => {
      const id = toCalendarId("calendar-123");
      expect(id).toBe("calendar-123");
    });

    it("handles empty string", () => {
      const id = toCalendarId("");
      expect(id).toBe("");
    });

    it("handles special characters", () => {
      const id = toCalendarId("cal@example.com");
      expect(id).toBe("cal@example.com");
    });

    it("returns type-compatible with string operations", () => {
      const id: CalendarId = toCalendarId("test");
      expect(id.toUpperCase()).toBe("TEST");
      expect(id.length).toBe(4);
    });
  });

  describe("toEventId", () => {
    it("returns the input string as EventId", () => {
      const id = toEventId("event-456");
      expect(id).toBe("event-456");
    });

    it("handles base64-like IDs", () => {
      const id = toEventId("YWJjZGVmZ2hpams=");
      expect(id).toBe("YWJjZGVmZ2hpams=");
    });

    it("returns type-compatible with string operations", () => {
      const id: EventId = toEventId("event123");
      expect(id.includes("event")).toBe(true);
    });
  });

  describe("toUserId", () => {
    it("returns the input string as UserId", () => {
      const id = toUserId("user-789");
      expect(id).toBe("user-789");
    });

    it("handles UUID format", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      const id = toUserId(uuid);
      expect(id).toBe(uuid);
    });

    it("returns type-compatible with string operations", () => {
      const id: UserId = toUserId("user_abc");
      expect(id.startsWith("user")).toBe(true);
    });
  });
});

describe("enum constants", () => {
  describe("ProviderId", () => {
    it("has correct values", () => {
      expect(ProviderId.GOOGLE).toBe("google");
      expect(ProviderId.OUTLOOK).toBe("outlook");
      expect(ProviderId.APPLE).toBe("apple");
    });

    it("has exactly 3 providers", () => {
      expect(Object.keys(ProviderId)).toHaveLength(3);
    });
  });

  describe("AccessRole", () => {
    it("has correct values", () => {
      expect(AccessRole.OWNER).toBe("owner");
      expect(AccessRole.WRITER).toBe("writer");
      expect(AccessRole.READER).toBe("reader");
      expect(AccessRole.FREE_BUSY_READER).toBe("freeBusyReader");
    });

    it("has exactly 4 roles", () => {
      expect(Object.keys(AccessRole)).toHaveLength(4);
    });
  });

  describe("ResponseStatus", () => {
    it("has correct values", () => {
      expect(ResponseStatus.NEEDS_ACTION).toBe("needsAction");
      expect(ResponseStatus.DECLINED).toBe("declined");
      expect(ResponseStatus.TENTATIVE).toBe("tentative");
      expect(ResponseStatus.ACCEPTED).toBe("accepted");
    });

    it("has exactly 4 statuses", () => {
      expect(Object.keys(ResponseStatus)).toHaveLength(4);
    });
  });

  describe("EventStatus", () => {
    it("has correct values", () => {
      expect(EventStatus.CONFIRMED).toBe("confirmed");
      expect(EventStatus.TENTATIVE).toBe("tentative");
      expect(EventStatus.CANCELLED).toBe("cancelled");
    });

    it("has exactly 3 statuses", () => {
      expect(Object.keys(EventStatus)).toHaveLength(3);
    });
  });

  describe("Visibility", () => {
    it("has correct values", () => {
      expect(Visibility.DEFAULT).toBe("default");
      expect(Visibility.PUBLIC).toBe("public");
      expect(Visibility.PRIVATE).toBe("private");
      expect(Visibility.CONFIDENTIAL).toBe("confidential");
    });

    it("has exactly 4 visibility levels", () => {
      expect(Object.keys(Visibility)).toHaveLength(4);
    });
  });

  describe("EventOrderBy", () => {
    it("has correct values", () => {
      expect(EventOrderBy.START_TIME).toBe("startTime");
      expect(EventOrderBy.UPDATED).toBe("updated");
    });

    it("has exactly 2 order options", () => {
      expect(Object.keys(EventOrderBy)).toHaveLength(2);
    });
  });

  describe("SendUpdates", () => {
    it("has correct values", () => {
      expect(SendUpdates.ALL).toBe("all");
      expect(SendUpdates.EXTERNAL_ONLY).toBe("externalOnly");
      expect(SendUpdates.NONE).toBe("none");
    });

    it("has exactly 3 options", () => {
      expect(Object.keys(SendUpdates)).toHaveLength(3);
    });
  });

  describe("ReminderMethod", () => {
    it("has correct values", () => {
      expect(ReminderMethod.EMAIL).toBe("email");
      expect(ReminderMethod.POPUP).toBe("popup");
      expect(ReminderMethod.SMS).toBe("sms");
    });

    it("has exactly 3 methods", () => {
      expect(Object.keys(ReminderMethod)).toHaveLength(3);
    });
  });

  describe("RecurrenceFrequency", () => {
    it("has correct values", () => {
      expect(RecurrenceFrequency.DAILY).toBe("daily");
      expect(RecurrenceFrequency.WEEKLY).toBe("weekly");
      expect(RecurrenceFrequency.MONTHLY).toBe("monthly");
      expect(RecurrenceFrequency.YEARLY).toBe("yearly");
    });

    it("has exactly 4 frequencies", () => {
      expect(Object.keys(RecurrenceFrequency)).toHaveLength(4);
    });
  });

  describe("Weekday", () => {
    it("has correct RFC 5545 values", () => {
      expect(Weekday.MONDAY).toBe("MO");
      expect(Weekday.TUESDAY).toBe("TU");
      expect(Weekday.WEDNESDAY).toBe("WE");
      expect(Weekday.THURSDAY).toBe("TH");
      expect(Weekday.FRIDAY).toBe("FR");
      expect(Weekday.SATURDAY).toBe("SA");
      expect(Weekday.SUNDAY).toBe("SU");
    });

    it("has exactly 7 days", () => {
      expect(Object.keys(Weekday)).toHaveLength(7);
    });
  });
});
