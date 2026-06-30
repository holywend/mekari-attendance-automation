import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import { CredentialStore } from "./store";
import type { Credentials } from "./types";

const TMP_DIR = path.join(process.cwd(), ".tmp-test-store");
const FILE = path.join(TMP_DIR, "credentials.json");

beforeEach(async () => {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
});

afterEach(async () => {
  await fs.rm(TMP_DIR, { recursive: true, force: true });
});

describe("CredentialStore", () => {
  it("returns null when file does not exist", async () => {
    const store = new CredentialStore(FILE);
    expect(await store.read()).toBeNull();
  });

  it("writes and reads back credentials", async () => {
    const store = new CredentialStore(FILE);
    const creds: Credentials = {
      cookie: "a=b",
      auth_token: "token-123",
      lastRefreshedAt: "2026-06-30T10:00:00.000Z",
      source: "refresh",
    };
    await store.write(creds);
    expect(await store.read()).toEqual(creds);
  });

  it("write replaces existing file atomically", async () => {
    const store = new CredentialStore(FILE);
    const a: Credentials = {
      cookie: "old",
      auth_token: "old",
      lastRefreshedAt: "2026-06-29T10:00:00.000Z",
      source: "bootstrap",
    };
    const b: Credentials = {
      cookie: "new",
      auth_token: "new",
      lastRefreshedAt: "2026-06-30T10:00:00.000Z",
      source: "login",
    };
    await store.write(a);
    await store.write(b);
    expect(await store.read()).toEqual(b);
    const entries = await fs.readdir(TMP_DIR);
    expect(entries.filter((e) => e.endsWith(".tmp"))).toEqual([]);
  });

  it("creates parent directory if missing", async () => {
    const nested = path.join(TMP_DIR, "nested", "credentials.json");
    const store = new CredentialStore(nested);
    const creds: Credentials = {
      cookie: "x",
      auth_token: "y",
      lastRefreshedAt: "2026-06-30T10:00:00.000Z",
      source: "refresh",
    };
    await store.write(creds);
    expect(await store.read()).toEqual(creds);
  });

  it("returns null when file is malformed JSON", async () => {
    await fs.writeFile(FILE, "not json {{");
    const store = new CredentialStore(FILE);
    expect(await store.read()).toBeNull();
  });
});
