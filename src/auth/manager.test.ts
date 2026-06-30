import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { AuthManager } from "./manager";
import { CredentialStore } from "./store";
import {
  LoginFailedError,
  RefreshFailedError,
  SessionExpiredError,
  type Credentials,
} from "./types";

const TMP = path.join(process.cwd(), ".tmp-test-manager");
const FILE = path.join(TMP, "credentials.json");

const FRESH: Credentials = {
  cookie: "fresh-cookie",
  auth_token: "fresh-token",
  lastRefreshedAt: "2026-06-30T10:00:00.000Z",
  source: "bootstrap",
};

const STALE: Credentials = {
  ...FRESH,
  lastRefreshedAt: "2026-06-20T10:00:00.000Z",
};

const REFRESHED: Credentials = {
  cookie: "refreshed-cookie",
  auth_token: "refreshed-token",
  lastRefreshedAt: "2026-06-30T10:00:00.000Z",
  source: "refresh",
};

const LOGGED_IN: Credentials = {
  cookie: "loggedin-cookie",
  auth_token: "loggedin-token",
  lastRefreshedAt: "2026-06-30T10:00:00.000Z",
  source: "login",
};

const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
const REFERENCE_NOW = new Date("2026-06-30T10:00:00.000Z").getTime();

beforeEach(async () => {
  await fs.rm(TMP, { recursive: true, force: true });
  await fs.mkdir(TMP, { recursive: true });
});
afterEach(async () => {
  await fs.rm(TMP, { recursive: true, force: true });
});

function makeManager(overrides: Partial<{
  initialFile: Credentials | null;
  bootstrap: () => Promise<Credentials>;
  refresh: (c: Credentials) => Promise<Credentials>;
  login: () => Promise<Credentials>;
  now: () => number;
  refreshAfterMs: number;
}> = {}) {
  const store = new CredentialStore(FILE);
  const seedFile = async () => {
    if (overrides.initialFile) await store.write(overrides.initialFile);
  };

  const refreshFn =
    overrides.refresh ??
    (async () => {
      throw new Error("refresh not stubbed");
    });
  const loginFn =
    overrides.login ??
    (async () => {
      throw new Error("login not stubbed");
    });
  const bootstrapFn =
    overrides.bootstrap ??
    (async () => {
      throw new Error("bootstrap not stubbed");
    });

  const manager = new AuthManager({
    store,
    bootstrapFromConfig: bootstrapFn,
    refreshFn,
    loginFn,
    refreshAfterMs: overrides.refreshAfterMs ?? SIX_DAYS_MS,
    now: overrides.now ?? (() => REFERENCE_NOW),
    logger: () => {},
  });

  return { manager, store, seedFile };
}

describe("AuthManager.getValidCredentials", () => {
  it("bootstraps from legacy config when store is empty", async () => {
    const { manager, store } = makeManager({
      bootstrap: async () => FRESH,
    });
    const creds = await manager.getValidCredentials();
    expect(creds).toEqual(FRESH);
    expect(await store.read()).toEqual(FRESH);
  });

  it("returns cached fresh creds without hitting refresh or login", async () => {
    const { manager, seedFile } = makeManager({
      initialFile: FRESH,
    });
    await seedFile();
    expect(await manager.getValidCredentials()).toEqual(FRESH);
    expect(await manager.getValidCredentials()).toEqual(FRESH);
  });

  it("refreshes when creds are stale", async () => {
    let refreshCalls = 0;
    const { manager, seedFile, store } = makeManager({
      initialFile: STALE,
      refresh: async () => {
        refreshCalls++;
        return REFRESHED;
      },
    });
    await seedFile();
    const result = await manager.getValidCredentials();
    expect(result).toEqual(REFRESHED);
    expect(refreshCalls).toBe(1);
    expect(await store.read()).toEqual(REFRESHED);
  });

  it("falls back to login when refresh raises SessionExpiredError", async () => {
    let refreshCalls = 0;
    let loginCalls = 0;
    const { manager, seedFile, store } = makeManager({
      initialFile: STALE,
      refresh: async () => {
        refreshCalls++;
        throw new SessionExpiredError("dead");
      },
      login: async () => {
        loginCalls++;
        return LOGGED_IN;
      },
    });
    await seedFile();
    const result = await manager.getValidCredentials();
    expect(result).toEqual(LOGGED_IN);
    expect(refreshCalls).toBe(1);
    expect(loginCalls).toBe(1);
    expect(await store.read()).toEqual(LOGGED_IN);
  });

  it("propagates RefreshFailedError without falling back to login", async () => {
    const { manager, seedFile } = makeManager({
      initialFile: STALE,
      refresh: async () => {
        throw new RefreshFailedError("network");
      },
      login: async () => {
        throw new Error("login should not be called");
      },
    });
    await seedFile();
    await expect(manager.getValidCredentials()).rejects.toBeInstanceOf(
      RefreshFailedError,
    );
  });

  it("propagates LoginFailedError when both paths fail", async () => {
    const { manager, seedFile } = makeManager({
      initialFile: STALE,
      refresh: async () => {
        throw new SessionExpiredError("dead");
      },
      login: async () => {
        throw new LoginFailedError("bad password");
      },
    });
    await seedFile();
    await expect(manager.getValidCredentials()).rejects.toBeInstanceOf(
      LoginFailedError,
    );
  });

  it("invalidate() forces a refresh on the next call even if creds were fresh", async () => {
    let refreshCalls = 0;
    const { manager, seedFile } = makeManager({
      initialFile: FRESH,
      refresh: async () => {
        refreshCalls++;
        return REFRESHED;
      },
    });
    await seedFile();
    expect(await manager.getValidCredentials()).toEqual(FRESH);
    manager.invalidate();
    expect(await manager.getValidCredentials()).toEqual(REFRESHED);
    expect(refreshCalls).toBe(1);
  });

  it("concurrent calls do not double-refresh", async () => {
    let refreshCalls = 0;
    const { manager, seedFile } = makeManager({
      initialFile: STALE,
      refresh: async () => {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return REFRESHED;
      },
    });
    await seedFile();
    const [a, b] = await Promise.all([
      manager.getValidCredentials(),
      manager.getValidCredentials(),
    ]);
    expect(a).toEqual(REFRESHED);
    expect(b).toEqual(REFRESHED);
    expect(refreshCalls).toBe(1);
  });
});
