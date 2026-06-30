import { describe, expect, it } from "bun:test";
import { loginAndCaptureCredentials } from "./login";
import { LoginFailedError } from "./types";

describe("loginAndCaptureCredentials (unit)", () => {
  it("wraps internal failures as LoginFailedError", async () => {
    await expect(
      loginAndCaptureCredentials("a@b.com", "pw", {
        browserFactory: async () => {
          throw new Error("chromium missing");
        },
      }),
    ).rejects.toBeInstanceOf(LoginFailedError);
  });

  it("throws LoginFailedError when post-login URL is never reached", async () => {
    const fakeBrowser = makeFakeBrowser({
      waitForURLThrows: true,
    });
    await expect(
      loginAndCaptureCredentials("a@b.com", "pw", {
        browserFactory: async () => fakeBrowser,
      }),
    ).rejects.toBeInstanceOf(LoginFailedError);
  });
});

function makeFakeBrowser(opts: { waitForURLThrows?: boolean }) {
  const page = {
    goto: async () => {},
    fill: async () => {},
    click: async () => {},
    waitForURL: async () => {
      if (opts.waitForURLThrows) throw new Error("timeout");
    },
    locator: () => ({ first: () => ({ waitFor: async () => {} }) }),
  };
  const context = {
    newPage: async () => page,
    cookies: async () => [],
  };
  return {
    newContext: async () => context,
    close: async () => {},
  };
}
