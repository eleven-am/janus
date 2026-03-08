import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { ChatStreamError, ModelProvider, calendarChat } from "./chat.js";
import { createOllama } from "ollama-ai-provider-v2";
import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import * as toolsModule from "./tools.js";

vi.mock("ollama-ai-provider-v2", () => ({ createOllama: vi.fn() }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: vi.fn() }));
vi.mock("ai", () => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn(),
  tool: (config: any) => ({ ...config, execute: config.execute }),
  zodSchema: (schema: any) => schema,
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
vi.mock("@/lib/logging.js", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logEvent: vi.fn(),
  logDebug: vi.fn(),
}));

const mockCreateAnthropic = createAnthropic as unknown as Mock;
const mockCreateOllama = createOllama as unknown as Mock;
const mockStreamText = streamText as unknown as Mock;
let createCalendarToolsSpy: ReturnType<typeof vi.spyOn>;

function createMockStream(chunks: string[], finalText: string) {
  async function* textStream() {
    for (const chunk of chunks) yield chunk;
  }
  return { textStream: textStream(), text: Promise.resolve(finalText) };
}

describe("ChatStreamError", () => {
  it("sets name to ChatStreamError", () => {
    const error = new ChatStreamError("msg", "CODE");
    expect(error.name).toBe("ChatStreamError");
  });

  it("sets message, code, and context correctly", () => {
    const ctx = { userId: "u1" };
    const error = new ChatStreamError("something broke", "BROKEN", ctx);
    expect(error.message).toBe("something broke");
    expect(error.code).toBe("BROKEN");
    expect(error.context).toEqual({ userId: "u1" });
  });

  it("context is optional", () => {
    const error = new ChatStreamError("msg", "CODE");
    expect(error.context).toBeUndefined();
  });
});

describe("ModelProvider", () => {
  it("OLLAMA equals ollama", () => {
    expect(ModelProvider.OLLAMA).toBe("ollama");
  });

  it("ANTHROPIC equals anthropic", () => {
    expect(ModelProvider.ANTHROPIC).toBe("anthropic");
  });
});

describe("calendarChat", () => {
  const mockModelFn = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createCalendarToolsSpy = vi.spyOn(toolsModule, "createCalendarTools").mockReturnValue({} as any);
    mockModelFn.mockReturnValue("mock-model-instance");
    mockCreateAnthropic.mockReturnValue(mockModelFn as any);
    mockCreateOllama.mockReturnValue(mockModelFn as any);
    mockStreamText.mockReturnValue(
      createMockStream(["hello"], "hello") as any,
    );
  });

  afterEach(() => {
    createCalendarToolsSpy?.mockRestore();
  });

  describe("provider selection", () => {
    it("uses Anthropic provider when specified", async () => {
      const gen = calendarChat({
        userId: "u1",
        messages: [],
        provider: ModelProvider.ANTHROPIC,
      });
      for await (const _ of gen) {}

      expect(createAnthropic).toHaveBeenCalledWith({
        apiKey: "test-key",
      });
      expect(mockModelFn).toHaveBeenCalledWith("claude-haiku-4-5-20251001");
    });

    it("uses Ollama provider by default", async () => {
      const gen = calendarChat({ userId: "u1", messages: [] });
      for await (const _ of gen) {}

      expect(createOllama).toHaveBeenCalledWith({
        baseURL: "http://localhost:11434",
      });
      expect(mockModelFn).toHaveBeenCalledWith("llama3.2");
    });

    it("uses custom model name when provided", async () => {
      const gen = calendarChat({
        userId: "u1",
        messages: [],
        provider: ModelProvider.ANTHROPIC,
        model: "claude-opus-4-6",
      });
      for await (const _ of gen) {}

      expect(mockModelFn).toHaveBeenCalledWith("claude-opus-4-6");
    });
  });

  describe("error handling", () => {
    it("throws STREAM_INIT_FAILED when streamText throws", async () => {
      mockStreamText.mockImplementation(() => {
        throw new Error("init boom");
      });

      const gen = calendarChat({
        userId: "u1",
        messages: [],
        provider: ModelProvider.OLLAMA,
      });

      try {
        for await (const _ of gen) {}
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ChatStreamError);
        expect((e as ChatStreamError).code).toBe("STREAM_INIT_FAILED");
      }
    });

    it("throws STREAM_INTERRUPTED when textStream iteration fails", async () => {
      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          throw new Error("stream boom");
        })(),
        text: Promise.resolve(""),
      } as any);

      const gen = calendarChat({
        userId: "u1",
        messages: [],
        provider: ModelProvider.OLLAMA,
      });

      try {
        for await (const _ of gen) {}
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ChatStreamError);
        expect((e as ChatStreamError).code).toBe("STREAM_INTERRUPTED");
      }
    });

    it("throws STREAM_FINALIZE_FAILED when text promise rejects", async () => {
      mockStreamText.mockReturnValue({
        textStream: (async function* () {
          yield "ok";
        })(),
        text: Promise.reject(new Error("finalize boom")),
      } as any);

      const gen = calendarChat({
        userId: "u1",
        messages: [],
        provider: ModelProvider.OLLAMA,
      });

      try {
        for await (const _ of gen) {}
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(ChatStreamError);
        expect((e as ChatStreamError).code).toBe("STREAM_FINALIZE_FAILED");
      }
    });
  });

  describe("success path", () => {
    it("yields chunks from textStream", async () => {
      mockStreamText.mockReturnValue(
        createMockStream(["Hello", " ", "world"], "Hello world") as any,
      );

      const gen = calendarChat({ userId: "u1", messages: [] });
      const chunks: string[] = [];
      for await (const chunk of gen) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(["Hello", " ", "world"]);
    });

    it("returns final text", async () => {
      mockStreamText.mockReturnValue(
        createMockStream(["Hi"], "Hi there") as any,
      );

      const gen = calendarChat({ userId: "u1", messages: [] });
      let result: string | undefined;
      while (true) {
        const { value, done } = await gen.next();
        if (done) {
          result = value as string;
          break;
        }
      }

      expect(result).toBe("Hi there");
    });
  });
});
