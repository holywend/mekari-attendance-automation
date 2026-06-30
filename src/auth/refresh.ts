import { extractAuthToken } from "./cookie-utils";
import {
  RefreshFailedError,
  SessionExpiredError,
  type Credentials,
} from "./types";

const REFRESH_URL = "https://hr.talenta.co/sso-callback/refresh-token";

type FetchImpl = typeof fetch;

type Options = {
  fetchImpl?: FetchImpl;
  now?: () => Date;
};

export async function refreshSession(
  current: Credentials,
  opts: Options = {},
): Promise<Credentials> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());

  let response: Response;
  try {
    response = await fetchImpl(REFRESH_URL, {
      method: "GET",
      redirect: "manual",
      headers: {
        Cookie: current.cookie,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        Accept: "application/json, text/plain, */*",
      },
    });
  } catch (e) {
    throw new RefreshFailedError(
      `network error during refresh: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Any non-2xx response means we don't have a valid refreshed session.
  // Treat as session-expired so the AuthManager falls through to the
  // Playwright cold path. Network-level failures (fetch threw above) stay
  // as RefreshFailedError because Playwright would also fail in that case.
  if (response.status < 200 || response.status >= 300) {
    throw new SessionExpiredError(
      `refresh non-2xx response: ${response.status}`,
    );
  }

  const setCookies = response.headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) {
    // No Set-Cookie headers means we'd silently re-use the stale cookie below.
    // Treat as session expiry rather than success — forces the cold path.
    throw new SessionExpiredError(
      "refresh response had no Set-Cookie headers",
    );
  }
  const merged = mergeCookies(current.cookie, setCookies);

  const newToken = extractAuthToken(merged);
  if (!newToken) {
    throw new SessionExpiredError(
      "refresh response did not contain a new _session_token",
    );
  }

  return {
    cookie: merged,
    auth_token: newToken,
    lastRefreshedAt: now().toISOString(),
    source: "refresh",
  };
}

function mergeCookies(currentCookie: string, setCookies: string[]): string {
  const map = new Map<string, string>();
  for (const pair of currentCookie.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = pair.slice(eq + 1).trim();
    if (name) map.set(name, value);
  }
  for (const sc of setCookies) {
    const firstSemi = sc.indexOf(";");
    const head = firstSemi === -1 ? sc : sc.slice(0, firstSemi);
    const eq = head.indexOf("=");
    if (eq === -1) continue;
    const name = head.slice(0, eq).trim();
    const value = head.slice(eq + 1).trim();
    if (name) map.set(name, value);
  }
  return Array.from(map.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}
