import { describe, expect, it } from "bun:test";
import { extractAuthToken, formatCookieHeader } from "./cookie-utils";

// Synthetic fixture mimicking the URL-encoded PHP-serialized blob shape that
// Talenta uses for _session_token. The hash and inner token are fake.
const SYNTHETIC_SESSION_VALUE =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa%3A2%3A%7Bi%3A0%3Bs%3A14%3A%22_session_token%22%3Bi%3A1%3Bs%3A69%3A%2200000000-0000-0000-0000-000000000000_synthetictokenforunitteststests1234%22%3B%7D";

describe("extractAuthToken", () => {
  it("extracts the bearer token from a _session_token cookie value", () => {
    const cookie = `_ga=GA1.1; _session_token=${SYNTHETIC_SESSION_VALUE}; locale=id`;
    const token = extractAuthToken(cookie);
    expect(token).toBe(
      "00000000-0000-0000-0000-000000000000_synthetictokenforunitteststests1234",
    );
  });

  it("returns null when _session_token is absent", () => {
    expect(extractAuthToken("_ga=foo; locale=id")).toBeNull();
  });

  it("returns null when _session_token value is malformed", () => {
    expect(extractAuthToken("_session_token=garbage")).toBeNull();
  });
});

describe("formatCookieHeader", () => {
  it("joins name/value pairs with `; `", () => {
    const cookies = [
      { name: "a", value: "1" },
      { name: "b", value: "two" },
    ];
    expect(formatCookieHeader(cookies)).toBe("a=1; b=two");
  });

  it("preserves cookie value characters as-is (no double-encoding)", () => {
    const cookies = [{ name: "x", value: "val%20with%20encoded" }];
    expect(formatCookieHeader(cookies)).toBe("x=val%20with%20encoded");
  });
});
