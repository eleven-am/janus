import { describe, it, expect, beforeEach, afterEach, spyOn, setSystemTime } from "bun:test";
import { logError, logWarn, logInfo, logEvent, logDebug } from "./logging.js";

describe("logging", () => {
  let stderrWrite: ReturnType<typeof spyOn>;
  let stdoutWrite: ReturnType<typeof spyOn>;
  let mockDate: Date;

  beforeEach(() => {
    stderrWrite = spyOn(process.stderr, "write").mockImplementation(() => true);
    stdoutWrite = spyOn(process.stdout, "write").mockImplementation(() => true);
    mockDate = new Date("2024-01-15T10:30:00.000Z");
    setSystemTime(mockDate);
  });

  afterEach(() => {
    stderrWrite.mockRestore();
    stdoutWrite.mockRestore();
    setSystemTime();
  });

  describe("logError", () => {
    it("writes to stderr", () => {
      logError("TEST_ERROR");

      expect(stderrWrite).toHaveBeenCalled();
      expect(stdoutWrite).not.toHaveBeenCalled();
    });

    it("outputs correct JSON format", () => {
      logError("TEST_ERROR");

      const output = stderrWrite.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());

      expect(parsed).toEqual({
        timestamp: "2024-01-15T10:30:00.000Z",
        level: "error",
        code: "TEST_ERROR",
      });
    });

    it("includes context when provided", () => {
      logError("TEST_ERROR", { userId: "123", action: "test" });

      const output = stderrWrite.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());

      expect(parsed.context).toEqual({
        userId: "123",
        action: "test",
      });
    });

    it("formats Error objects in context", () => {
      const error = new Error("Something went wrong");
      logError("TEST_ERROR", { error });

      const output = stderrWrite.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());

      expect(parsed.context.error.name).toBe("Error");
      expect(parsed.context.error.message).toBe("Something went wrong");
      expect(parsed.context.error.stack).toBeDefined();
    });

    it("formats non-Error values in error field", () => {
      logError("TEST_ERROR", { error: "string error" });

      const output = stderrWrite.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());

      expect(parsed.context.error).toEqual({ value: "string error" });
    });
  });

  describe("logWarn", () => {
    it("writes to stdout", () => {
      logWarn("TEST_WARN");

      expect(stdoutWrite).toHaveBeenCalled();
      expect(stderrWrite).not.toHaveBeenCalled();
    });

    it("outputs correct level", () => {
      logWarn("TEST_WARN");

      const output = stdoutWrite.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());

      expect(parsed.level).toBe("warn");
      expect(parsed.code).toBe("TEST_WARN");
    });
  });

  describe("logInfo", () => {
    it("writes to stdout", () => {
      logInfo("TEST_INFO");

      expect(stdoutWrite).toHaveBeenCalled();
      expect(stderrWrite).not.toHaveBeenCalled();
    });

    it("outputs correct level", () => {
      logInfo("TEST_INFO");

      const output = stdoutWrite.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());

      expect(parsed.level).toBe("info");
      expect(parsed.code).toBe("TEST_INFO");
    });

    it("includes context with nested objects", () => {
      logInfo("TEST_INFO", {
        user: { id: "123", name: "Test" },
        metadata: { source: "api" },
      });

      const output = stdoutWrite.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());

      expect(parsed.context).toEqual({
        user: { id: "123", name: "Test" },
        metadata: { source: "api" },
      });
    });
  });

  describe("logEvent", () => {
    it("is an alias for logInfo (uses info level)", () => {
      logEvent("EVENT_CODE");

      const output = stdoutWrite.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());

      expect(parsed.level).toBe("info");
      expect(parsed.code).toBe("EVENT_CODE");
    });

    it("writes to stdout", () => {
      logEvent("EVENT_CODE");

      expect(stdoutWrite).toHaveBeenCalled();
      expect(stderrWrite).not.toHaveBeenCalled();
    });
  });

  describe("logDebug", () => {
    it("writes to stdout", () => {
      logDebug("DEBUG_CODE");

      expect(stdoutWrite).toHaveBeenCalled();
      expect(stderrWrite).not.toHaveBeenCalled();
    });

    it("outputs correct level", () => {
      logDebug("DEBUG_CODE");

      const output = stdoutWrite.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());

      expect(parsed.level).toBe("debug");
      expect(parsed.code).toBe("DEBUG_CODE");
    });
  });

  describe("timestamp format", () => {
    it("uses ISO 8601 format", () => {
      logInfo("TEST");

      const output = stdoutWrite.mock.calls[0][0] as string;
      const parsed = JSON.parse(output.trim());

      expect(parsed.timestamp).toBe("2024-01-15T10:30:00.000Z");
      expect(new Date(parsed.timestamp).toISOString()).toBe(parsed.timestamp);
    });
  });

  describe("output format", () => {
    it("outputs newline-terminated JSON", () => {
      logInfo("TEST");

      const output = stdoutWrite.mock.calls[0][0] as string;
      expect(output.endsWith("\n")).toBe(true);
      expect(() => JSON.parse(output.trim())).not.toThrow();
    });

    it("outputs valid single-line JSON", () => {
      logInfo("TEST", { key: "value" });

      const output = stdoutWrite.mock.calls[0][0] as string;
      expect(output.split("\n").length).toBe(2);
    });
  });
});
