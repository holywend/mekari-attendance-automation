import { TalentaAttendance } from "./talenta";
import { buildAuthManager } from "./auth/wiring";
import { loadAttendanceConfig } from "./config";
import nodeCron from "node-cron";

const clockinTime = process.env.CLOCKIN_TIME;
const clockoutTime = process.env.CLOCKOUT_TIME;

if (!clockinTime || !clockoutTime) {
  console.error(
    "Set CLOCKIN_TIME and CLOCKOUT_TIME env vars (HH:mm), e.g. CLOCKIN_TIME=09:00 CLOCKOUT_TIME=18:00",
  );
  process.exit(1);
}

const convertTimeToCron = (timeStr: string, label: string) => {
  const [hour, minute] = timeStr.split(":").map(Number);
  if (
    hour === undefined ||
    minute === undefined ||
    isNaN(hour) ||
    isNaN(minute)
  ) {
    throw new Error(`Invalid ${label} time format: ${timeStr}. Expected HH:mm`);
  }
  return `${minute} ${hour} * * 1-5`;
};

const config = await loadAttendanceConfig();
const auth = buildAuthManager(config);
const talentaAttendance = new TalentaAttendance(config, auth);

const inCron = convertTimeToCron(clockinTime, "CLOCKIN_TIME");
const outCron = convertTimeToCron(clockoutTime, "CLOCKOUT_TIME");

console.log(`[schedule] clockin  ${clockinTime}  cron=${inCron}`);
console.log(`[schedule] clockout ${clockoutTime}  cron=${outCron}`);
console.log(`[schedule] running — Ctrl-C (or 'make stop') to stop`);

nodeCron.schedule(inCron, () => talentaAttendance.clockin());
nodeCron.schedule(outCron, () => talentaAttendance.clockout());
