import type { AttendanceConfig } from "./talenta";

const CONFIG_PATH = "./config/talenta.json";

type StaticConfig = {
  device_model: string;
  os_version: string;
  photos: string[];
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env and fill in the values.`,
    );
  }
  return value;
}

function requireEnvNumber(name: string): number {
  const raw = requireEnv(name);
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Environment variable ${name} must be a number, got ${raw}`);
  }
  return n;
}

export async function loadAttendanceConfig(): Promise<AttendanceConfig> {
  const staticConfig = (await Bun.file(CONFIG_PATH).json()) as StaticConfig;

  if (!staticConfig.device_model || !staticConfig.os_version) {
    throw new Error(
      `${CONFIG_PATH} must contain device_model and os_version`,
    );
  }
  if (!Array.isArray(staticConfig.photos) || staticConfig.photos.length === 0) {
    throw new Error(`${CONFIG_PATH} must contain a non-empty photos array`);
  }

  return {
    company_id: requireEnvNumber("TALENTA_COMPANY_ID"),
    latitude: requireEnv("TALENTA_LATITUDE"),
    longitude: requireEnv("TALENTA_LONGITUDE"),
    device_id: requireEnv("TALENTA_DEVICE_ID"),
    attendance_office_hour_id: requireEnvNumber("TALENTA_OFFICE_HOUR_ID"),
    device_model: staticConfig.device_model,
    os_version: staticConfig.os_version,
    photos: staticConfig.photos,
    // Bootstrap creds are optional — only used on first run when
    // storage/credentials.json doesn't exist yet.
    cookie: process.env.TALENTA_BOOTSTRAP_COOKIE,
    auth_token: process.env.TALENTA_BOOTSTRAP_AUTH_TOKEN,
  };
}
