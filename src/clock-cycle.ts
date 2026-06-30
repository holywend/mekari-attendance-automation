import { TalentaAttendance } from "./talenta";
import { buildAuthManager } from "./auth/wiring";
import { loadAttendanceConfig } from "./config";

const delaySeconds = Number(process.env.DELAY ?? 10);
const config = await loadAttendanceConfig();
const auth = buildAuthManager(config);
const talentaAttendance = new TalentaAttendance(config, auth);

await talentaAttendance.clockin();
console.log(`[Cycle] Waiting ${delaySeconds}s before clock out...`);
await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
await talentaAttendance.clockout();
