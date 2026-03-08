import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn();
const mockLogEvent = vi.fn();

vi.mock("@/auth/index.js", () => ({
  auth: { api: { getSession: (...args: unknown[]) => mockGetSession(...args), getAccessToken: vi.fn() } },
}));

vi.mock("@/lib/logging.js", () => ({
  logError: vi.fn(),
  logWarn: vi.fn(),
  logInfo: vi.fn(),
  logEvent: (...args: unknown[]) => mockLogEvent(...args),
  logDebug: vi.fn(),
}));

import { requireAuth } from "./middleware";

describe("requireAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns AuthContext with userId and session when session exists", async () => {
    const fakeSession = { user: { id: "user-123" }, session: { token: "abc" } };
    mockGetSession.mockResolvedValue(fakeSession);

    const request = new Request("http://localhost/api/test", { method: "GET" });
    const result = await requireAuth(request);

    expect(result).toEqual({ userId: "user-123", session: fakeSession });
    expect(mockGetSession).toHaveBeenCalledWith({ headers: request.headers });
  });

  it("returns 401 Response with correct JSON body when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const request = new Request("http://localhost/api/test", { method: "POST" });
    const result = await requireAuth(request);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: "Unauthorized",
      code: "UNAUTHORIZED",
    });
  });

  it("logs auth_failed event with path and method when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const request = new Request("http://localhost/api/dashboard", { method: "GET" });
    await requireAuth(request);

    expect(mockLogEvent).toHaveBeenCalledWith("auth_failed", {
      path: "/api/dashboard",
      method: "GET",
    });
  });
});
