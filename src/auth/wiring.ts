import path from "node:path";
import { AuthManager } from "./manager";
import { CredentialStore } from "./store";
import { refreshSession } from "./refresh";
import { loginAndCaptureCredentials } from "./login";
import type { Credentials } from "./types";
import type { AttendanceConfig } from "../talenta";

const STORE_PATH = path.join(process.cwd(), "storage", "credentials.json");

export function buildAuthManager(config: AttendanceConfig): AuthManager {
  const store = new CredentialStore(STORE_PATH);
  const email = process.env.TALENTA_EMAIL;
  const password = process.env.TALENTA_PASSWORD;

  return new AuthManager({
    store,
    refreshFn: (current) => refreshSession(current),
    loginFn: () => {
      if (!email || !password) {
        throw new Error(
          "Cold-path login requested but TALENTA_EMAIL/TALENTA_PASSWORD are not set in .env",
        );
      }
      return loginAndCaptureCredentials(email, password);
    },
    bootstrapFromConfig: async () => {
      if (!config.cookie || !config.auth_token) {
        throw new Error(
          "First run requires a cookie and auth_token in config/talenta.json (one-time bootstrap)",
        );
      }
      const creds: Credentials = {
        cookie: config.cookie,
        auth_token: config.auth_token,
        lastRefreshedAt: new Date(0).toISOString(),
        source: "bootstrap",
      };
      return creds;
    },
    logger: (msg) => process.stdout.write(`[auth] ${msg}\n`),
  });
}
