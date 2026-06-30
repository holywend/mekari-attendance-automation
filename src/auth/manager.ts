import { CredentialStore } from "./store";
import {
  RefreshFailedError,
  SessionExpiredError,
  type Credentials,
} from "./types";

type RefreshFn = (current: Credentials) => Promise<Credentials>;
type LoginFn = () => Promise<Credentials>;
type BootstrapFn = () => Promise<Credentials>;

export interface AuthGate {
  getValidCredentials(): Promise<Credentials>;
  invalidate(): void;
}

export type AuthManagerOptions = {
  store: CredentialStore;
  bootstrapFromConfig: BootstrapFn;
  refreshFn: RefreshFn;
  loginFn: LoginFn;
  refreshAfterMs?: number;
  now?: () => number;
  logger?: (msg: string) => void;
};

const DEFAULT_REFRESH_AFTER_MS = 6 * 24 * 60 * 60 * 1000;

export class AuthManager implements AuthGate {
  private cache: Credentials | null = null;
  private forceRefreshNext = false;
  private refreshAfterMs: number;
  private now: () => number;
  private logger: (msg: string) => void;
  private inFlight: Promise<Credentials> | null = null;

  constructor(private opts: AuthManagerOptions) {
    this.refreshAfterMs = opts.refreshAfterMs ?? DEFAULT_REFRESH_AFTER_MS;
    this.now = opts.now ?? (() => Date.now());
    this.logger = opts.logger ?? (() => {});
  }

  async getValidCredentials(): Promise<Credentials> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.doGet().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  invalidate(): void {
    this.cache = null;
    this.forceRefreshNext = true;
    this.logger("auth: cache invalidated");
  }

  private async doGet(): Promise<Credentials> {
    const forced = this.forceRefreshNext;
    this.forceRefreshNext = false;

    if (!forced && this.cache && this.isFresh(this.cache)) return this.cache;

    let current = await this.opts.store.read();
    if (!current) {
      this.logger("auth: bootstrapping from legacy config");
      current = await this.opts.bootstrapFromConfig();
      await this.opts.store.write(current);
    }

    if (!forced && this.cache === null && this.isFresh(current)) {
      this.cache = current;
      return current;
    }

    try {
      this.logger("auth: refreshing session");
      const refreshed = await this.opts.refreshFn(current);
      await this.opts.store.write(refreshed);
      this.cache = refreshed;
      return refreshed;
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        this.logger("auth: session expired, logging in");
        const fresh = await this.opts.loginFn();
        await this.opts.store.write(fresh);
        this.cache = fresh;
        return fresh;
      }
      if (e instanceof RefreshFailedError) {
        this.logger(`auth: refresh failed (${e.message})`);
        throw e;
      }
      throw e;
    }
  }

  private isFresh(c: Credentials): boolean {
    const age = this.now() - new Date(c.lastRefreshedAt).getTime();
    return age >= 0 && age < this.refreshAfterMs;
  }
}
