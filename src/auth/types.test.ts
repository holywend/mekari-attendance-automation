import { describe, expect, it } from "bun:test";
import {
  SessionExpiredError,
  LoginFailedError,
  RefreshFailedError,
} from "./types";

describe("typed auth errors", () => {
  it("SessionExpiredError preserves identity through throw/catch", () => {
    try {
      throw new SessionExpiredError("session gone");
    } catch (e) {
      expect(e).toBeInstanceOf(SessionExpiredError);
      expect((e as Error).message).toBe("session gone");
    }
  });

  it("LoginFailedError and RefreshFailedError are distinct types", () => {
    const a = new LoginFailedError("bad creds");
    const b = new RefreshFailedError("network");
    expect(a).toBeInstanceOf(LoginFailedError);
    expect(a).not.toBeInstanceOf(RefreshFailedError);
    expect(b).toBeInstanceOf(RefreshFailedError);
    expect(b).not.toBeInstanceOf(LoginFailedError);
  });
});
