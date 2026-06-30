import { TalentaAttendance } from "./talenta";
import { buildAuthManager } from "./auth/wiring";
import { loadAttendanceConfig } from "./config";
import inquirer from "inquirer";
import nodeCron from "node-cron";

const config = await loadAttendanceConfig();
const auth = buildAuthManager(config);
const talentaAttendance = new TalentaAttendance(config, auth);

const { task } = await inquirer.prompt([
  {
    type: "list",
    name: "task",
    message: "Select Task",
    choices: [
      { name: "Clockin", value: "clockin" },
      { name: "Clockout", value: "clockout" },
      { name: "Auto", value: "auto" },
    ],
  },
]);

switch (task) {
  case "clockin":
    await talentaAttendance.clockin();
    break;
  case "clockout":
    await talentaAttendance.clockout();
    break;
  case "auto": {
    const { clockinTime, clockoutTime } = await inquirer.prompt([
      { type: "input", name: "clockinTime", message: "Enter Clock In Time" },
      { type: "input", name: "clockoutTime", message: "Enter Clock Out Time" },
    ]);

    const convertTimeToCron = (timeStr: string) => {
      const [hour, minute] = timeStr.split(":").map(Number);
      if (isNaN(hour as number) || isNaN(minute as number)) {
        throw new Error("Invalid time format. Expected HH:mm");
      }
      return `${minute} ${hour} * * *`;
    };
    console.log(convertTimeToCron(clockinTime), convertTimeToCron(clockoutTime));
    console.log("Initialize Clockin CRON");
    nodeCron.schedule(convertTimeToCron(clockinTime), () =>
      talentaAttendance.clockin(),
    );
    console.log("Initialize Clockout CRON");
    nodeCron.schedule(convertTimeToCron(clockoutTime), () =>
      talentaAttendance.clockout(),
    );
    break;
  }
}
