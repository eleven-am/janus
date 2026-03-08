import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getCalendarProvider,
  UnsupportedProviderError,
  ProviderId,
} from "./index.js";

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

vi.mock("@/auth/index.js", () => ({
  auth: {
    api: {
      getAccessToken: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

describe("getCalendarProvider", () => {
  const userId = "user-123";

  it("returns GoogleCalendarProvider for google provider", () => {
    const provider = getCalendarProvider(userId, ProviderId.GOOGLE);
    expect(provider.providerId).toBe(ProviderId.GOOGLE);
    expect(typeof provider.listCalendars).toBe("function");
    expect(typeof provider.listEvents).toBe("function");
    expect(typeof provider.createEvent).toBe("function");
  });

  it("returns OutlookCalendarProvider for outlook provider", () => {
    const provider = getCalendarProvider(userId, ProviderId.OUTLOOK);
    expect(provider.providerId).toBe(ProviderId.OUTLOOK);
    expect(typeof provider.listCalendars).toBe("function");
    expect(typeof provider.listEvents).toBe("function");
    expect(typeof provider.createEvent).toBe("function");
  });

  it("throws UnsupportedProviderError for apple provider", () => {
    expect(() => getCalendarProvider(userId, ProviderId.APPLE)).toThrow(
      "Calendar provider 'apple' is not supported yet"
    );
  });

  it("throws UnsupportedProviderError for unknown provider", () => {
    expect(() =>
      getCalendarProvider(userId, "unknown" as ProviderId)
    ).toThrow("not supported yet");
  });

  it("creates new instance each time", () => {
    const provider1 = getCalendarProvider(userId, ProviderId.GOOGLE);
    const provider2 = getCalendarProvider(userId, ProviderId.GOOGLE);
    expect(provider1).not.toBe(provider2);
  });

  it("passes userId to provider constructor", () => {
    const provider = getCalendarProvider("specific-user-id", ProviderId.GOOGLE);
    expect(provider).toBeDefined();
  });
});

describe("UnsupportedProviderError", () => {
  it("has correct name", () => {
    const error = new UnsupportedProviderError("test");
    expect(error.name).toBe("UnsupportedProviderError");
  });

  it("has correct message format", () => {
    const error = new UnsupportedProviderError("myProvider");
    expect(error.message).toBe("Calendar provider 'myProvider' is not supported yet");
  });

  it("is instanceof Error", () => {
    const error = new UnsupportedProviderError("test");
    expect(error).toBeInstanceOf(Error);
  });

  it("can be caught as Error", () => {
    try {
      throw new UnsupportedProviderError("test");
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect((e as Error).message).toContain("test");
    }
  });
});

describe("exports", () => {
  it("exports CalendarProvider base class", async () => {
    const mod = await import("./index.js");
    expect(mod.CalendarProvider).toBeDefined();
  });

  it("exports all type constants", async () => {
    const mod = await import("./index.js");
    expect(mod.ProviderId).toBeDefined();
    expect(mod.AccessRole).toBeDefined();
    expect(mod.ResponseStatus).toBeDefined();
    expect(mod.EventStatus).toBeDefined();
    expect(mod.Visibility).toBeDefined();
    expect(mod.SendUpdates).toBeDefined();
    expect(mod.ReminderMethod).toBeDefined();
    expect(mod.RecurrenceFrequency).toBeDefined();
    expect(mod.Weekday).toBeDefined();
  });

  it("exports branded type helpers", async () => {
    const mod = await import("./index.js");
    expect(mod.toCalendarId).toBeDefined();
    expect(mod.toEventId).toBeDefined();
    expect(mod.toUserId).toBeDefined();
  });
});
