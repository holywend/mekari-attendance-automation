import type { Browser, BrowserContext } from "playwright";
import { extractAuthToken, formatCookieHeader } from "./cookie-utils";
import { LoginFailedError, type Credentials } from "./types";

const LOGIN_URL = "https://account.mekari.com/users/sign_in?app_referer=Talenta";
const DASHBOARD_URL_PATTERN = /https:\/\/hr\.talenta\.co\/employee\/dashboard/;
const TIMEOUT_MS = 60_000;

type Options = {
  browserFactory?: () => Promise<Browser | FakeBrowser>;
  now?: () => Date;
};

type FakeBrowser = {
  newContext(): Promise<{
    newPage(): Promise<{
      goto(url: string, opts?: object): Promise<unknown>;
      fill(selector: string, value: string): Promise<void>;
      click(selector: string): Promise<void>;
      waitForURL(url: RegExp | string, opts?: object): Promise<void>;
      locator(selector: string): { first(): { waitFor(): Promise<void> } };
    }>;
    cookies(): Promise<Array<{ name: string; value: string }>>;
  }>;
  close(): Promise<void>;
};

export async function loginAndCaptureCredentials(
  email: string,
  password: string,
  opts: Options = {},
): Promise<Credentials> {
  if (!email || !password) {
    throw new LoginFailedError(
      "missing TALENTA_EMAIL or TALENTA_PASSWORD",
    );
  }

  const now = opts.now ?? (() => new Date());
  const factory =
    opts.browserFactory ??
    (async (): Promise<Browser> => {
      const { chromium } = await import("playwright");
      return chromium.launch({ headless: true });
    });

  let browser: Browser | FakeBrowser | undefined;
  try {
    browser = await factory();
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });

    await page.fill('input[name="user[email]"]', email);
    await page.fill('input[name="user[password]"]', password);
    // Use the email/password submit button by id. The Mekari login page also
    // ships a "Sign in dengan Google" <button type="submit"> that would match
    // a generic submit selector and silently route us into Google OAuth.
    await page.click("#new-signin-button");

    await page.waitForURL(DASHBOARD_URL_PATTERN, { timeout: TIMEOUT_MS });

    const browserCookies = await (context as BrowserContext).cookies();
    const cookieHeader = formatCookieHeader(browserCookies);
    const authToken = extractAuthToken(cookieHeader);
    if (!authToken) {
      throw new LoginFailedError(
        "post-login cookies did not contain _session_token",
      );
    }

    return {
      cookie: cookieHeader,
      auth_token: authToken,
      lastRefreshedAt: now().toISOString(),
      source: "login",
    };
  } catch (e) {
    if (e instanceof LoginFailedError) throw e;
    throw new LoginFailedError(
      `login failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore close-time errors
      }
    }
  }
}
