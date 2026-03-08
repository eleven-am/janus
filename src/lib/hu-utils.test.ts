import { describe, it, expect, vi, beforeEach } from "vitest";
import { mock } from "bun:test";

const mockReadFileSync = vi.fn();

mock.module("fs", () => ({ readFileSync: mockReadFileSync }));
mock.module("@/config/index.js", () => ({
  config: { HU_PRIVATE_KEY_PATH: "/test/private.pem" },
}));

import { loadPrivateKey } from "./hu-utils";

describe("loadPrivateKey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns file content when readFileSync succeeds", () => {
    mockReadFileSync.mockReturnValue("-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----");

    const result = loadPrivateKey();

    expect(result).toBe("-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----");
    expect(mockReadFileSync).toHaveBeenCalledWith("/test/private.pem", "utf-8");
  });

  it("returns empty string when readFileSync throws file not found", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    const result = loadPrivateKey();

    expect(result).toBe("");
  });

  it("returns empty string on any read error", () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const result = loadPrivateKey();

    expect(result).toBe("");
  });
});
