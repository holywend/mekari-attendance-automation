import { describe, expect, it } from "bun:test";
import { loginAndCaptureCredentials } from "./login";

const RUN = process.env.RUN_LIVE_TALENTA_TESTS === "1";

describe.if(RUN)("loginAndCaptureCredentials (live)", () => {
  it("logs in to Mekari and returns valid credentials", async () => {
    const email = process.env.TALENTA_EMAIL;
    const password = process.env.TALENTA_PASSWORD;
    if (!email || !password) {
      throw new Error("TALENTA_EMAIL/TALENTA_PASSWORD not set in env");
    }

    const creds = await loginAndCaptureCredentials(email, password);
    expect(creds.cookie).toContain("_session_token=");
    expect(creds.auth_token.length).toBeGreaterThan(20);
    expect(creds.source).toBe("login");
  }, 120_000);
});
