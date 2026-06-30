export type Credentials = {
  cookie: string;
  auth_token: string;
  lastRefreshedAt: string;
  source: "bootstrap" | "refresh" | "login";
};

export class SessionExpiredError extends Error {
  override name = "SessionExpiredError";
}

export class LoginFailedError extends Error {
  override name = "LoginFailedError";
}

export class RefreshFailedError extends Error {
  override name = "RefreshFailedError";
}
