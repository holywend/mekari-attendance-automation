import { describe, expect, it } from "bun:test";
import { refreshSession } from "./refresh";
import { SessionExpiredError, RefreshFailedError } from "./types";
import type { Credentials } from "./types";

const baseCreds: Credentials = {
  cookie: "_session_token=old-session-value-encoded",
  auth_token: "old-token",
  lastRefreshedAt: "2026-06-20T10:00:00.000Z",
  source: "bootstrap",
};

const NEW_SESSION_VALUE =
  "newhash%3A2%3A%7Bi%3A0%3Bs%3A14%3A%22_session_token%22%3Bi%3A1%3Bs%3A69%3A%22NEW-TOKEN-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%22%3B%7D";

describe("refreshSession", () => {
  it("returns new credentials on 200 with rotated _session_token", async () => {
    const fakeFetch = async (): Promise<Response> => {
      const headers = new Headers();
      headers.append(
        "set-cookie",
        `_session_token=${NEW_SESSION_VALUE}; Path=/; HttpOnly`,
      );
      headers.append("set-cookie", `_ga=GA1.1.something; Path=/`);
      return new Response("{}", { status: 200, headers });
    };

    const result = await refreshSession(baseCreds, {
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    expect(result.source).toBe("refresh");
    expect(result.cookie).toContain("_session_token=");
    expect(result.cookie).toContain(NEW_SESSION_VALUE);
    expect(result.auth_token).toBe(
      "NEW-TOKEN-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(new Date(result.lastRefreshedAt).getTime()).toBeGreaterThan(
      new Date(baseCreds.lastRefreshedAt).getTime(),
    );
  });

  it("throws SessionExpiredError on 401", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response("{}", { status: 401 });
    await expect(
      refreshSession(baseCreds, {
        fetchImpl: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("throws SessionExpiredError on 200 without _session_token", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response("{}", { status: 200, headers: new Headers() });
    await expect(
      refreshSession(baseCreds, {
        fetchImpl: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("throws SessionExpiredError on 5xx (so AuthManager falls through to Playwright)", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response("oops", { status: 502 });
    await expect(
      refreshSession(baseCreds, {
        fetchImpl: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("throws SessionExpiredError on 405 (endpoint shape changed)", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response("method not allowed", { status: 405 });
    await expect(
      refreshSession(baseCreds, {
        fetchImpl: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it("throws RefreshFailedError on network error", async () => {
    const fakeFetch = async (): Promise<Response> => {
      throw new Error("ECONNREFUSED");
    };
    await expect(
      refreshSession(baseCreds, {
        fetchImpl: fakeFetch as unknown as typeof fetch,
      }),
    ).rejects.toBeInstanceOf(RefreshFailedError);
  });
});
