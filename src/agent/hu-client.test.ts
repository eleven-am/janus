import { mock } from "bun:test";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { UtteranceContext } from "@eleven-am/hu-sdk";

mock.module("@/db/index.js", () => ({ db: {} }));

const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockRegisterFilters = vi.fn();

let capturedCallbacks: Record<string, Function> = {};
let lastConstructorArgs: unknown = null;

vi.mock("@eleven-am/hu-sdk", () => {
  class MockVoiceAgent {
    connect = mockConnect;
    disconnect = mockDisconnect;
    registerFilters = mockRegisterFilters;
    constructor(config: unknown) { lastConstructorArgs = config; }
    onSessionStart(cb: Function) { capturedCallbacks.onSessionStart = cb; return this; }
    onSessionEnd(cb: Function) { capturedCallbacks.onSessionEnd = cb; return this; }
    onUtterance(cb: Function) { capturedCallbacks.onUtterance = cb; return this; }
    onInterrupt(cb: Function) { capturedCallbacks.onInterrupt = cb; return this; }
    onConnect(cb: Function) { capturedCallbacks.onConnect = cb; return this; }
    onDisconnect(cb: Function) { capturedCallbacks.onDisconnect = cb; return this; }
    onError(cb: Function) { capturedCallbacks.onError = cb; return this; }
  }
  return {
    VoiceAgent: MockVoiceAgent,
    ConnectionModes: { WebSocket: "websocket" },
    Tiers: { Filtered: "filtered" },
  };
});

vi.mock("@/auth/index.js", () => ({
  auth: { api: { getSession: vi.fn(), getAccessToken: vi.fn() } },
}));

const mockDbSelect = vi.fn();
vi.mock("@/db/index.js", () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

vi.mock("@/db/auth.schema.js", () => ({
  account: {
    userId: "userId",
    providerId: "providerId",
    accountId: "accountId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((a, b) => ({ eq: [a, b] })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}));

const mockCalendarChat = vi.fn();


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

vi.mock("@/lib/logging.js", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logEvent: vi.fn(),
  logDebug: vi.fn(),
}));

import { startHuAgent, stopHuAgent } from "./hu-client.js";
import { logError, logEvent } from "@/lib/logging.js";
import { ChatStreamError } from "./chat.js";
import * as chatModule from "./chat.js";
import * as huUtilsModule from "@/lib/hu-utils.js";

function setupDbChain(result: unknown[]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(result),
  };
  mockDbSelect.mockReturnValue(chain);
  return chain;
}

function createMockUtteranceContext(
  overrides: Partial<UtteranceContext> = {},
): UtteranceContext {
  return {
    sessionId: "test-session-id",
    userId: "hu-user-123",
    text: "What's on my calendar today?",
    isFinal: true,
    entities: [],
    topics: [],
    context: [],
    user: { name: "Test User", id: "hu-user-123" },
    done: vi.fn(),
    sendDelta: vi.fn(),
    abortSignal: new AbortController().signal,
    ...overrides,
  } as unknown as UtteranceContext;
}

async function* mockStream(chunks: string[]) {
  for (const chunk of chunks) yield chunk;
}

describe("hu-client", () => {
  let calendarChatSpy: ReturnType<typeof vi.spyOn>;
  let loadPrivateKeySpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    capturedCallbacks = {};
    lastConstructorArgs = null;
    vi.clearAllMocks();
    vi.useFakeTimers();
    calendarChatSpy = vi.spyOn(chatModule, "calendarChat").mockImplementation((...args: any[]) => mockCalendarChat(...args));
    loadPrivateKeySpy = vi.spyOn(huUtilsModule, "loadPrivateKey").mockReturnValue("mock-private-key");
  });

  afterEach(() => {
    calendarChatSpy?.mockRestore();
    loadPrivateKeySpy?.mockRestore();
    stopHuAgent();
    vi.useRealTimers();
  });

  describe("startHuAgent", () => {
    it("creates VoiceAgent with correct config", () => {
      startHuAgent();

      expect(lastConstructorArgs).toEqual({
        agentId: "test-agent-id",
        privateKey: "mock-private-key",
        gatewayUrl: "wss://test.voice.maix.ovh",
        mode: "websocket",
        reconnect: true,
      });
    });

    it("calls agent.connect()", () => {
      startHuAgent();

      expect(mockConnect).toHaveBeenCalledOnce();
    });

    it("is idempotent - calling twice returns same agent", () => {
      const first = startHuAgent();
      const second = startHuAgent();

      expect(first).toBe(second);
      expect(mockConnect).toHaveBeenCalledTimes(1);
    });
  });

  describe("stopHuAgent", () => {
    it("disconnects agent and clears state", () => {
      startHuAgent();
      stopHuAgent();

      expect(mockDisconnect).toHaveBeenCalledOnce();
    });

    it("is safe to call when no agent exists", () => {
      expect(() => stopHuAgent()).not.toThrow();
      expect(mockDisconnect).not.toHaveBeenCalled();
    });
  });

  describe("onConnect callback", () => {
    it("registers filters on connect", () => {
      startHuAgent();
      capturedCallbacks.onConnect();

      expect(mockRegisterFilters).toHaveBeenCalledWith({
        entities: ["PERSON", "DATE", "TIME", "ORG"],
        topics: [
          "calendar",
          "meeting",
          "schedule",
          "event",
          "appointment",
          "reminder",
        ],
        keywords: [
          "schedule",
          "meeting",
          "calendar",
          "busy",
          "free",
          "available",
          "book",
          "cancel",
          "reschedule",
          "remind",
        ],
        speakers: ["user", "agent:*"],
        includeContext: 5,
        tier: "filtered",
      });
    });
  });

  describe("onDisconnect callback", () => {
    it("clears sessions and stops cleanup", async () => {
      startHuAgent();
      capturedCallbacks.onConnect();

      setupDbChain([{ userId: "janus-user-1" }]);
      const ctx = createMockUtteranceContext();
      mockCalendarChat.mockReturnValue(mockStream(["Hello"]));
      await capturedCallbacks.onUtterance(ctx);

      capturedCallbacks.onDisconnect();

      setupDbChain([{ userId: "janus-user-1" }]);
      const ctx2 = createMockUtteranceContext({
        sessionId: "test-session-id",
        userId: "hu-user-123",
      });
      mockCalendarChat.mockReturnValue(mockStream(["Hi again"]));
      await capturedCallbacks.onUtterance(ctx2);

      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });
  });

  describe("onSessionEnd callback", () => {
    it("removes session and logs event", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);
      const ctx = createMockUtteranceContext();
      mockCalendarChat.mockReturnValue(mockStream(["Hello"]));
      await capturedCallbacks.onUtterance(ctx);

      capturedCallbacks.onSessionEnd("test-session-id", "user_left");

      expect(logEvent).toHaveBeenCalledWith("hu_session_ended", {
        sessionId: "test-session-id",
        reason: "user_left",
      });

      setupDbChain([{ userId: "janus-user-1" }]);
      const ctx2 = createMockUtteranceContext({
        sessionId: "test-session-id",
        userId: "hu-user-123",
      });
      mockCalendarChat.mockReturnValue(mockStream(["Hi again"]));
      await capturedCallbacks.onUtterance(ctx2);

      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });
  });

  describe("onInterrupt callback", () => {
    it("pops last user message from conversation history", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      const ctx = createMockUtteranceContext();
      mockCalendarChat.mockReturnValue(mockStream(["Response one"]));
      await capturedCallbacks.onUtterance(ctx);

      const ctx2 = createMockUtteranceContext({
        sessionId: "test-session-id",
        text: "Will error out",
      });
      mockCalendarChat.mockImplementation(() => {
        throw new Error("stream failed");
      });
      await capturedCallbacks.onUtterance(ctx2);

      capturedCallbacks.onInterrupt("test-session-id", "user_spoke");

      let msgSnapshot: any[] = [];
      mockCalendarChat.mockImplementation(({ messages }: any) => {
        msgSnapshot = messages.map((m: any) => ({ ...m }));
        return mockStream(["Next answer"]);
      });

      const ctx3 = createMockUtteranceContext({
        sessionId: "test-session-id",
        text: "Next question",
      });
      await capturedCallbacks.onUtterance(ctx3);

      const roles = msgSnapshot.map((m: any) => m.role);
      expect(roles[roles.length - 1]).toBe("user");
      expect(roles[roles.length - 2]).toBe("assistant");
    });

    it("does nothing when session has no messages", () => {
      startHuAgent();

      expect(() =>
        capturedCallbacks.onInterrupt("nonexistent-session", "user_spoke"),
      ).not.toThrow();
    });

    it("does not pop if last message is from assistant", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      const ctx = createMockUtteranceContext();
      mockCalendarChat.mockReturnValue(mockStream(["Some response"]));
      await capturedCallbacks.onUtterance(ctx);

      capturedCallbacks.onInterrupt("test-session-id", "user_spoke");

      let msgSnapshot: any[] = [];
      mockCalendarChat.mockImplementation(({ messages }: any) => {
        msgSnapshot = messages.map((m: any) => ({ ...m }));
        return mockStream(["Follow up response"]);
      });

      const ctx2 = createMockUtteranceContext({
        sessionId: "test-session-id",
        text: "Follow up",
      });
      await capturedCallbacks.onUtterance(ctx2);

      expect(msgSnapshot.length).toBe(3);
    });
  });

  describe("handleUtterance", () => {
    it("ignores non-final utterances", async () => {
      startHuAgent();
      const ctx = createMockUtteranceContext({ isFinal: false });

      await capturedCallbacks.onUtterance(ctx);

      expect(ctx.done).not.toHaveBeenCalled();
      expect(ctx.sendDelta).not.toHaveBeenCalled();
      expect(mockDbSelect).not.toHaveBeenCalled();
    });

    it("creates session and looks up janus user on first utterance", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      const ctx = createMockUtteranceContext();
      mockCalendarChat.mockReturnValue(mockStream(["Hello!"]));
      await capturedCallbacks.onUtterance(ctx);

      expect(mockDbSelect).toHaveBeenCalled();
    });

    it("sends auth message when no janusUserId found", async () => {
      startHuAgent();
      setupDbChain([]);

      const ctx = createMockUtteranceContext();
      await capturedCallbacks.onUtterance(ctx);

      expect(ctx.done).toHaveBeenCalledWith(
        "Welcome to Janus! To access your calendar, please authorize at janus.app/auth/hu",
      );
      expect(mockCalendarChat).not.toHaveBeenCalled();
    });

    it("retries user lookup when session exists but janusUserId is null", async () => {
      startHuAgent();
      setupDbChain([]);

      const ctx = createMockUtteranceContext();
      await capturedCallbacks.onUtterance(ctx);

      expect(ctx.done).toHaveBeenCalledWith(
        expect.stringContaining("authorize"),
      );

      setupDbChain([{ userId: "janus-user-1" }]);
      const ctx2 = createMockUtteranceContext({
        sessionId: "test-session-id",
        text: "Try again",
      });
      mockCalendarChat.mockReturnValue(mockStream(["Welcome back!"]));
      await capturedCallbacks.onUtterance(ctx2);

      expect(mockCalendarChat).toHaveBeenCalled();
    });

    it("streams response chunks via sendDelta and finalizes with done", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      const ctx = createMockUtteranceContext();
      mockCalendarChat.mockReturnValue(
        mockStream(["You have ", "a meeting ", "at 3pm"]),
      );
      await capturedCallbacks.onUtterance(ctx);

      expect(ctx.sendDelta).toHaveBeenCalledTimes(3);
      expect(ctx.sendDelta).toHaveBeenCalledWith("You have ");
      expect(ctx.sendDelta).toHaveBeenCalledWith("a meeting ");
      expect(ctx.sendDelta).toHaveBeenCalledWith("at 3pm");
      expect(ctx.done).toHaveBeenCalledWith("You have a meeting at 3pm");
    });

    it("calls calendarChat with correct parameters", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      const ctx = createMockUtteranceContext();
      mockCalendarChat.mockReturnValue(mockStream(["OK"]));
      await capturedCallbacks.onUtterance(ctx);

      expect(mockCalendarChat).toHaveBeenCalledWith({
        userId: "janus-user-1",
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "user" }),
        ]),
        provider: "anthropic",
      });
    });

    it("pops user message from history on empty response", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      const ctx = createMockUtteranceContext({ text: "First message" });
      mockCalendarChat.mockReturnValue(mockStream(["Response"]));
      await capturedCallbacks.onUtterance(ctx);

      const ctx2 = createMockUtteranceContext({
        sessionId: "test-session-id",
        text: "Empty response trigger",
      });
      mockCalendarChat.mockReturnValue(mockStream([""]));
      await capturedCallbacks.onUtterance(ctx2);

      let msgSnapshot: any[] = [];
      mockCalendarChat.mockImplementation(({ messages }: any) => {
        msgSnapshot = messages.map((m: any) => ({ ...m }));
        return mockStream(["Third response"]);
      });

      const ctx3 = createMockUtteranceContext({
        sessionId: "test-session-id",
        text: "Third message",
      });
      await capturedCallbacks.onUtterance(ctx3);

      expect(msgSnapshot).toHaveLength(3);
      expect(msgSnapshot[0].role).toBe("user");
      expect(msgSnapshot[1].role).toBe("assistant");
      expect(msgSnapshot[2].role).toBe("user");
    });

    it("trims conversation history to 20 messages", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      let lastMsgSnapshot: any[] = [];

      for (let i = 0; i < 12; i++) {
        mockCalendarChat.mockImplementation(({ messages }: any) => {
          lastMsgSnapshot = messages.map((m: any) => ({ ...m }));
          return mockStream([`Response ${i}`]);
        });
        const ctx = createMockUtteranceContext({
          sessionId: "test-session-id",
          text: `Message ${i}`,
        });
        await capturedCallbacks.onUtterance(ctx);
      }

      expect(lastMsgSnapshot.length).toBeLessThanOrEqual(21);
    });

    it("includes entity context in user message when entities present", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      const ctx = createMockUtteranceContext({
        entities: [
          { type: "PERSON", text: "John" },
          { type: "DATE", text: "tomorrow" },
        ] as any,
      });
      mockCalendarChat.mockReturnValue(mockStream(["Sure"]));
      await capturedCallbacks.onUtterance(ctx);

      const message = mockCalendarChat.mock.calls[0][0].messages[0].content;
      expect(message).toContain(
        "[Detected entities: PERSON:John, DATE:tomorrow]",
      );
    });

    it("includes prior conversation context in user message", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      const ctx = createMockUtteranceContext({
        context: [
          { speaker: "user", text: "Hello" },
          { speaker: "agent", text: "Hi there" },
        ] as any,
      });
      mockCalendarChat.mockReturnValue(mockStream(["Sure"]));
      await capturedCallbacks.onUtterance(ctx);

      const message = mockCalendarChat.mock.calls[0][0].messages[0].content;
      expect(message).toContain("[Recent conversation]");
      expect(message).toContain("user: Hello");
      expect(message).toContain("agent: Hi there");
    });

    it("does not include context prefix when context is empty", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      const ctx = createMockUtteranceContext({ context: [] });
      mockCalendarChat.mockReturnValue(mockStream(["OK"]));
      await capturedCallbacks.onUtterance(ctx);

      const message = mockCalendarChat.mock.calls[0][0].messages[0].content;
      expect(message).not.toContain("[Recent conversation]");
    });

    it("handles ChatStreamError gracefully", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      const ctx = createMockUtteranceContext();
      mockCalendarChat.mockImplementation(() => {
        throw new ChatStreamError("API rate limited", "RATE_LIMIT", {
          retryAfter: 30,
        });
      });
      await capturedCallbacks.onUtterance(ctx);

      expect(ctx.done).toHaveBeenCalledWith(
        "I encountered an error processing your request. Please try again.",
      );
      expect(logError).toHaveBeenCalledWith("hu_chat_stream_error", {
        sessionId: "test-session-id",
        code: "RATE_LIMIT",
        message: "API rate limited",
        context: { retryAfter: 30 },
      });
    });

    it("handles generic errors gracefully", async () => {
      startHuAgent();
      setupDbChain([{ userId: "janus-user-1" }]);

      const ctx = createMockUtteranceContext();
      const genericError = new Error("Network failure");
      mockCalendarChat.mockImplementation(() => {
        throw genericError;
      });
      await capturedCallbacks.onUtterance(ctx);

      expect(ctx.done).toHaveBeenCalledWith(
        "I encountered an error processing your request. Please try again.",
      );
      expect(logError).toHaveBeenCalledWith("hu_request_processing_failed", {
        error: genericError,
        sessionId: "test-session-id",
      });
    });

    it("skips session creation lookup when no huUserId", async () => {
      startHuAgent();

      const ctx = createMockUtteranceContext({
        userId: undefined as any,
        user: undefined as any,
      });
      await capturedCallbacks.onUtterance(ctx);

      expect(mockDbSelect).not.toHaveBeenCalled();
      expect(ctx.done).toHaveBeenCalledWith(
        expect.stringContaining("authorize"),
      );
    });
  });

  describe("session cleanup", () => {
    it("removes stale sessions after TTL expires", async () => {
      startHuAgent();
      capturedCallbacks.onConnect();

      setupDbChain([{ userId: "janus-user-1" }]);
      const ctx = createMockUtteranceContext();
      mockCalendarChat.mockReturnValue(mockStream(["Hello"]));
      await capturedCallbacks.onUtterance(ctx);

      vi.advanceTimersByTime(31 * 60 * 1000);

      expect(logEvent).toHaveBeenCalledWith("sessions_cleaned", {
        count: 1,
        remaining: 0,
      });

      setupDbChain([{ userId: "janus-user-1" }]);
      const ctx2 = createMockUtteranceContext({
        sessionId: "test-session-id",
      });
      mockCalendarChat.mockReturnValue(mockStream(["New session"]));
      await capturedCallbacks.onUtterance(ctx2);

      expect(mockDbSelect).toHaveBeenCalledTimes(2);
    });

    it("does not remove active sessions before TTL", async () => {
      startHuAgent();
      capturedCallbacks.onConnect();

      setupDbChain([{ userId: "janus-user-1" }]);
      const ctx = createMockUtteranceContext();
      mockCalendarChat.mockReturnValue(mockStream(["Hello"]));
      await capturedCallbacks.onUtterance(ctx);

      (logEvent as ReturnType<typeof vi.fn>).mockClear();

      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(logEvent).not.toHaveBeenCalledWith(
        "sessions_cleaned",
        expect.anything(),
      );
    });
  });
});
