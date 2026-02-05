import { VoiceAgent, ConnectionModes, Tiers, type UtteranceContext } from "@eleven-am/hu-sdk";
import { config } from "@/config/index.js";
import { calendarChat, ModelProvider, ChatStreamError } from "./chat.js";
import { db } from "@/db/index.js";
import { account } from "@/db/auth.schema.js";
import { eq, and } from "drizzle-orm";
import type { ModelMessage } from "ai";
import { logError, logInfo, logEvent } from "@/lib/logging.js";
import { loadPrivateKey } from "@/lib/hu-utils.js";

const SESSION_TTL_MS = 30 * 60 * 1000;
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 5;

interface HuSession {
  sessionId: string;
  huUserId: string | null;
  janusUserId: string | null;
  userName: string | null;
  conversationHistory: ModelMessage[];
  lastActivity: number;
}

const sessions = new Map<string, HuSession>();
let sessionCleanupInterval: NodeJS.Timeout | null = null;
let reconnectAttempts = 0;

function cleanupStaleSessions(): void {
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.lastActivity > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logEvent("sessions_cleaned", { count: cleaned, remaining: sessions.size });
  }
}

function startSessionCleanup(): void {
  if (sessionCleanupInterval) return;
  sessionCleanupInterval = setInterval(cleanupStaleSessions, 60 * 1000);
}

function stopSessionCleanup(): void {
  if (sessionCleanupInterval) {
    clearInterval(sessionCleanupInterval);
    sessionCleanupInterval = null;
  }
}

async function lookupJanusUser(huUserId: string): Promise<string | null> {
  try {
    const link = await db
      .select({ userId: account.userId })
      .from(account)
      .where(and(eq(account.providerId, "hu"), eq(account.accountId, huUserId)))
      .limit(1);

    return link[0]?.userId || null;
  } catch (error) {
    logError("hu_user_lookup_failed", { error, huUserId });
    return null;
  }
}

function buildContextFromPrior(ctx: UtteranceContext): string {
  if (ctx.context.length === 0) return "";

  const contextLines = ctx.context.map((c) => `${c.speaker}: ${c.text}`);
  return `[Recent conversation]\n${contextLines.join("\n")}\n\n`;
}

async function handleUtterance(ctx: UtteranceContext): Promise<void> {
  console.log("[HU] Utterance received:", {
    sessionId: ctx.sessionId,
    isFinal: ctx.isFinal,
    text: ctx.text,
    userId: ctx.userId,
  });

  if (!ctx.isFinal) return;

  const huUserId = ctx.userId;
  const userName = ctx.user?.name;

  logEvent("hu_utterance_received", {
    sessionId: ctx.sessionId,
    userName: userName || huUserId || "unknown",
    textLength: ctx.text.length,
    entityCount: ctx.entities.length,
    topicCount: ctx.topics.length,
  });

  let session = sessions.get(ctx.sessionId);

  if (!session) {
    const janusUserId = huUserId ? await lookupJanusUser(huUserId) : null;
    console.log("[HU] New session - looked up Janus user:", { huUserId, janusUserId });

    session = {
      sessionId: ctx.sessionId,
      huUserId: huUserId || null,
      janusUserId,
      userName: userName || null,
      conversationHistory: [],
      lastActivity: Date.now(),
    };
    sessions.set(ctx.sessionId, session);
  }

  session.lastActivity = Date.now();

  if (huUserId && !session.janusUserId) {
    session.janusUserId = await lookupJanusUser(huUserId);
  }

  if (!session.janusUserId) {
    ctx.done("Welcome to Janus! To access your calendar, please authorize at janus.app/auth/hu");
    return;
  }

  const priorContext = buildContextFromPrior(ctx);
  const entityContext = ctx.entities.length > 0
    ? `[Detected entities: ${ctx.entities.map((e) => `${e.type}:${e.text}`).join(", ")}]\n`
    : "";

  session.conversationHistory.push({
    role: "user",
    content: `[Current time: ${new Date().toISOString()}]\n${entityContext}${priorContext}${ctx.text}`,
  });

  try {
    const stream = calendarChat({
      userId: session.janusUserId,
      messages: session.conversationHistory,
      provider: ModelProvider.ANTHROPIC,
    });

    let fullResponse = "";

    for await (const chunk of stream) {
      if (ctx.abortSignal.aborted) {
        logEvent("hu_stream_aborted", { sessionId: ctx.sessionId });
        break;
      }
      fullResponse += chunk;
      ctx.sendDelta(chunk);
    }

    ctx.done(fullResponse);

    if (fullResponse.trim()) {
      session.conversationHistory.push({
        role: "assistant",
        content: fullResponse,
      });
    } else {
      session.conversationHistory.pop();
    }

    if (session.conversationHistory.length > 20) {
      session.conversationHistory = session.conversationHistory.slice(-20);
    }
  } catch (error) {
    if (error instanceof ChatStreamError) {
      logError("hu_chat_stream_error", {
        sessionId: ctx.sessionId,
        code: error.code,
        message: error.message,
        context: error.context,
      });
    } else {
      logError("hu_request_processing_failed", { error, sessionId: ctx.sessionId });
    }

    ctx.done("I encountered an error processing your request. Please try again.");
  }
}

let agent: VoiceAgent | null = null;

function scheduleReconnect(): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logError("hu_max_reconnect_attempts", { attempts: reconnectAttempts });
    return;
  }

  reconnectAttempts++;
  const delay = RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1);

  logInfo("hu_scheduling_reconnect", { attempt: reconnectAttempts, delayMs: delay });

  setTimeout(() => {
    if (agent) {
      logInfo("hu_attempting_reconnect", { attempt: reconnectAttempts });
      agent.connect();
    }
  }, delay);
}

export function startHuAgent(): VoiceAgent {
  if (agent) return agent;

  agent = new VoiceAgent({
    agentId: config.HU_AGENT_ID || "",
    privateKey: loadPrivateKey(),
    gatewayUrl: config.HU_URL || "https://voice.maix.ovh",
    mode: ConnectionModes.WebSocket,
    reconnect: false,
  });

  agent
    .onSessionStart((sessionId, userId, user) => {
      logEvent("hu_session_started", {
        sessionId,
        huUserId: userId,
        userName: user?.name,
      });
    })
    .onSessionEnd((sessionId, reason) => {
      logEvent("hu_session_ended", { sessionId, reason });
      sessions.delete(sessionId);
    })
    .onUtterance(handleUtterance)
    .onInterrupt((sessionId, reason) => {
      logEvent("hu_session_interrupted", { sessionId, reason });

      const session = sessions.get(sessionId);
      if (session && session.conversationHistory.length > 0) {
        const lastMessage = session.conversationHistory[session.conversationHistory.length - 1];
        if (lastMessage.role === "user") {
          session.conversationHistory.pop();
        }
      }
    })
    .onConnect(() => {
      logInfo("hu_connected", {});
      reconnectAttempts = 0;
      startSessionCleanup();

      agent!.registerFilters({
        entities: ["PERSON", "DATE", "TIME", "ORG"],
        topics: ["calendar", "meeting", "schedule", "event", "appointment", "reminder"],
        keywords: ["schedule", "meeting", "calendar", "busy", "free", "available", "book", "cancel", "reschedule", "remind"],
        speakers: ["user", "agent:*"],
        includeContext: 5,
        tier: Tiers.Filtered,
      });
    })
    .onDisconnect(() => {
      logInfo("hu_disconnected", {});
      sessions.clear();
      stopSessionCleanup();
    })
    .onError((error) => {
      logError("hu_connection_error", { message: error.message });
      scheduleReconnect();
    });

  agent.connect();

  return agent;
}

export function stopHuAgent(): void {
  if (agent) {
    agent.disconnect();
    agent = null;
  }
  sessions.clear();
  stopSessionCleanup();
  reconnectAttempts = 0;
}
