import FormData from "form-data";
import moment from "moment/moment";
import fs from "fs";
import path from "path";
import type { AuthGate } from "./auth/manager";

const LOG_DIR = "./storage";
const LOG_FILE = path.join(LOG_DIR, "attendance.log");

export type AttendanceConfig = {
  company_id: number;
  latitude: string;
  longitude: string;
  photos: string[];
  device_id: string;
  device_model: string;
  os_version: string;
  attendance_office_hour_id: number;
  cookie?: string;
  auth_token?: string;
};

type Options = {
  fetchImpl?: typeof fetch;
  logger?: (line: string) => void;
};

const ATTENDANCE_URL = (companyId: number) =>
  `https://api.mekari.com/internal/talenta-mobile/v3/attendance/organisations/${companyId}/attendance_clocks`;

export class TalentaAttendance {
  private fetchImpl: typeof fetch;
  private logger: (line: string) => void;

  constructor(
    private config: AttendanceConfig,
    private auth: AuthGate,
    opts: Options = {},
  ) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.logger = opts.logger ?? defaultFileLogger;
  }

  async clockin() {
    await this.run("Clockin", "clock_in");
  }

  async clockout() {
    await this.run("Clockout", "clock_out");
  }

  private async run(event: "Clockin" | "Clockout", eventType: string) {
    this.log(event, "OK", "executing");
    try {
      const response = await this.executeWithAuthRetry(eventType);
      const failed = isFailureResponse(response);
      this.log(event, failed ? "FAIL" : "OK", JSON.stringify(response));
    } catch (e) {
      this.log(
        event,
        "FAIL",
        `request error: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private async executeWithAuthRetry(eventType: string): Promise<unknown> {
    const first = await this.executeOnce(eventType);
    if (!isAuthFailure(first)) return first;
    this.auth.invalidate();
    return this.executeOnce(eventType);
  }

  private async executeOnce(eventType: string): Promise<unknown> {
    const creds = await this.auth.getValidCredentials();
    const config = this.config;
    const boundary = "alamofire.boundary.24ca81a4e16a56b4";
    const formData = new FormData({});
    formData.setBoundary(boundary);
    formData.append("attendance_office_hour_id", config.attendance_office_hour_id);
    formData.append("latitude", config.latitude);
    formData.append("longitude", config.longitude);
    formData.append("mixpanel[Entry point]", "Home");
    formData.append("event_type", eventType);
    formData.append("notes", "");
    formData.append("attendance_clock_type", "attendance");
    formData.append("source", "mobileapp");
    formData.append("attendance_office_hour_setting_id", config.attendance_office_hour_id);
    formData.append("schedule_date", moment().format("YYYY-MM-DD"));

    const photoPath = config.photos[Math.floor(Math.random() * config.photos.length)];
    if (!photoPath) throw new Error("no photos configured");
    formData.append("selfie_photo", fs.readFileSync(photoPath), {
      filename: `${randomString(17)}.jpeg`,
      contentType: "image/jpeg",
    });

    const buff = formData.getBuffer();
    const res = await this.fetchImpl(ATTENDANCE_URL(config.company_id), {
      method: "POST",
      body: buff,
      headers: {
        Connection: "keep-alive",
        Accept: "*/*",
        Authorization: `Bearer ${creds.auth_token}`,
        "Accept-Language": "en-EN",
        "Upload-Draft-Interop-Version": "6",
        "Accept-Encoding": "deflate, gzip",
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "User-Agent": "Talenta/11895 CFNetwork/3826.600.41 Darwin/24.6.0",
        "X-Device-ID": config.device_id,
        "X-App-Version": "2.97.0",
        "Upload-Complete": "?1",
        "X-Device-Model": config.device_model,
        "X-OS-Version": config.os_version,
        Cookie: creds.cookie,
      } as Record<string, string>,
    });

    try {
      return await res.json();
    } catch {
      return { status: res.status, error: "non_json_response" };
    }
  }

  private log(event: string, status: "OK" | "FAIL", detail: string) {
    const line = `${moment().format("YYYY-MM-DD HH:mm:ss")} [${event}] ${status} ${detail}\n`;
    this.logger(line);
  }
}

function isAuthFailure(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const r = response as Record<string, unknown>;
  if (r.error === "invalid_token") return true;
  if (typeof r.status === "number" && r.status === 401) return true;
  return false;
}

function isFailureResponse(response: unknown): boolean {
  if (!response || typeof response !== "object") return false;
  const r = response as Record<string, unknown>;
  if (r.error || r.error_type || r.errors) return true;
  if (r.code === false) return true;
  if (typeof r.status === "number" && r.status >= 400) return true;
  return false;
}

function randomString(n: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
  let out = "";
  for (let i = 0; i < n; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function defaultFileLogger(line: string) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch (e) {
    console.error(`[log] Failed to write log: ${e}`);
  }
  process.stdout.write(line);
}
