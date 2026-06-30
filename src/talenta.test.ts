import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { TalentaAttendance, type AttendanceConfig } from "./talenta";
import type { AuthGate } from "./auth/manager";
import type { Credentials } from "./auth/types";

const TMP = path.join(process.cwd(), ".tmp-test-talenta");
const PHOTO = path.join(TMP, "tiny.jpg");

const baseConfig: AttendanceConfig = {
  company_id: 12345,
  latitude: "0",
  longitude: "0",
  photos: [PHOTO],
  device_id: "DEV",
  device_model: "iPhone14,2",
  os_version: "iOS 18.6",
  attendance_office_hour_id: 999,
};

const c1: Credentials = {
  cookie: "stale-cookie",
  auth_token: "stale-token",
  lastRefreshedAt: "2026-06-30T10:00:00.000Z",
  source: "bootstrap",
};
const c2: Credentials = {
  cookie: "fresh-cookie",
  auth_token: "fresh-token",
  lastRefreshedAt: "2026-06-30T10:01:00.000Z",
  source: "login",
};

beforeEach(async () => {
  await fs.rm(TMP, { recursive: true, force: true });
  await fs.mkdir(TMP, { recursive: true });
  await fs.writeFile(PHOTO, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
});
afterEach(async () => {
  await fs.rm(TMP, { recursive: true, force: true });
});

function makeAuthGate(creds: Credentials[]) {
  let idx = 0;
  let invalidations = 0;
  const gate: AuthGate = {
    getValidCredentials: async () => {
      const cur = creds[Math.min(idx, creds.length - 1)];
      if (!cur) throw new Error("no creds");
      return cur;
    },
    invalidate: () => {
      invalidations++;
      idx++;
    },
  };
  return {
    gate,
    invalidations: () => invalidations,
  };
}

describe("TalentaAttendance.executeAttendance (auth retry)", () => {
  it("retries once after invalid_token and uses fresh creds", async () => {
    const { gate, invalidations } = makeAuthGate([c1, c2]);
    const seenAuth: string[] = [];
    const fakeFetch = async (
      _url: string,
      init: { headers: Record<string, string> },
    ): Promise<Response> => {
      seenAuth.push(init.headers["Authorization"] ?? "");
      if (seenAuth.length === 1) {
        return new Response(
          JSON.stringify({
            error: "invalid_token",
            error_description: "expired",
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ message: "success", status: 200 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const ta = new TalentaAttendance(baseConfig, gate, {
      fetchImpl: fakeFetch as unknown as typeof fetch,
      logger: () => {},
    });

    await ta.clockin();
    expect(seenAuth).toEqual([`Bearer stale-token`, `Bearer fresh-token`]);
    expect(invalidations()).toBe(1);
  });

  it("does not retry more than once on repeated 401", async () => {
    const { gate, invalidations } = makeAuthGate([c1, c2]);
    let calls = 0;
    const fakeFetch = async (): Promise<Response> => {
      calls++;
      return new Response(
        JSON.stringify({ error: "invalid_token" }),
        { status: 401 },
      );
    };
    const ta = new TalentaAttendance(baseConfig, gate, {
      fetchImpl: fakeFetch as unknown as typeof fetch,
      logger: () => {},
    });
    await ta.clockin();
    expect(calls).toBe(2);
    expect(invalidations()).toBe(1);
  });

  it("does not retry on non-auth errors", async () => {
    const { gate, invalidations } = makeAuthGate([c1]);
    let calls = 0;
    const fakeFetch = async (): Promise<Response> => {
      calls++;
      return new Response(
        JSON.stringify({
          error_type: "validation_error",
          message: "latitude is a required field",
          status: 400,
        }),
        { status: 400 },
      );
    };
    const ta = new TalentaAttendance(baseConfig, gate, {
      fetchImpl: fakeFetch as unknown as typeof fetch,
      logger: () => {},
    });
    await ta.clockin();
    expect(calls).toBe(1);
    expect(invalidations()).toBe(0);
  });
});
