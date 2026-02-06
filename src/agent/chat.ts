import { streamText, stepCountIs, type ModelMessage } from "ai";
import { createOllama } from "ollama-ai-provider-v2";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createCalendarTools } from "./tools.js";
import { config } from "@/config/index.js";
import { logError } from "@/lib/logging.js";

export const ModelProvider = {
  OLLAMA: "ollama",
  ANTHROPIC: "anthropic",
} as const;

export type ModelProvider = (typeof ModelProvider)[keyof typeof ModelProvider];

export interface ChatOptions {
  userId: string;
  messages: ModelMessage[];
  provider?: ModelProvider;
  model?: string;
}

export class ChatStreamError extends Error {
  readonly code: string;
  readonly context?: Record<string, unknown>;

  constructor(message: string, code: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "ChatStreamError";
    this.code = code;
    this.context = context;
  }
}

const SYSTEM_PROMPT = `You are Janus, a helpful calendar assistant. You help users manage their Google Calendar through natural conversation.

CRITICAL: Your responses will be spoken aloud by a text-to-speech system. DO NOT use any markdown formatting:
- No asterisks for bold or italics
- No hash symbols for headers
- No bullet points with dashes or asterisks
- No code blocks or backticks
- No numbered lists with periods (use "first", "second" etc. instead)
- Write in plain, natural spoken language

When users ask about their schedule or want to manage events:
First call list_calendars to see what calendars are available. IMPORTANT: Users often have multiple calendars such as work, personal, family, tasks, etc. When checking what the user has scheduled, query ALL their calendars (not just primary) to give a complete picture. Only use just "primary" if the user specifically asks about their main calendar. For date and time operations, use ISO 8601 format. IMPORTANT: When creating events, you MUST always include a timezone. Infer the timezone from the user's existing calendar events or ask them if unsure. Common timezones: Europe/Paris, Europe/London, America/New_York, America/Los_Angeles.

CRITICAL: Be extremely brief. Never repeat information the user just gave you. Never explain what you are about to do or what you just did. Only confirm the result. Only ask a question if you are missing information you cannot infer. Do not use filler phrases or pleasantries.

When listing events, speak them naturally with time, title, and location if available. For example, say "You have a meeting at 2pm called Team Standup" rather than using bullet points.

Current date/time context will be provided by the user's system.`;

function getModel(provider: ModelProvider, model?: string) {
  switch (provider) {
    case ModelProvider.ANTHROPIC: {
      const anthropic = createAnthropic({ apiKey: config.ANTHROPIC_API_KEY });
      return anthropic(model || "claude-haiku-4-5-20251001");
    }
    case ModelProvider.OLLAMA: {
      const ollama = createOllama({ baseURL: config.OLLAMA_URL });
      return ollama(model || "llama3.2");
    }
    default: {
      const anthropic = createAnthropic({ apiKey: config.ANTHROPIC_API_KEY });
      return anthropic("claude-haiku-4-5-20251001");
    }
  }
}

export async function* calendarChat(options: ChatOptions) {
  const { userId, messages, provider = ModelProvider.OLLAMA, model } = options;

  const tools = createCalendarTools({ userId });
  const llm = getModel(provider, model);

  let result;
  try {
    result = streamText({
      model: llm,
      system: SYSTEM_PROMPT,
      messages,
      tools,
      stopWhen: stepCountIs(10),
    });
  } catch (error) {
    logError("chat_stream_init_failed", { error, userId, provider, model });
    throw new ChatStreamError(
      "Failed to initialize chat stream",
      "STREAM_INIT_FAILED",
      { userId, provider, model }
    );
  }

  try {
    for await (const chunk of result.textStream) {
      yield chunk;
    }
  } catch (error) {
    logError("chat_stream_iteration_failed", { error, userId, provider, model });
    throw new ChatStreamError(
      "Chat stream interrupted",
      "STREAM_INTERRUPTED",
      { userId, provider, model }
    );
  }

  try {
    return await result.text;
  } catch (error) {
    logError("chat_stream_finalize_failed", { error, userId, provider, model });
    throw new ChatStreamError(
      "Failed to finalize chat response",
      "STREAM_FINALIZE_FAILED",
      { userId, provider, model }
    );
  }
}
