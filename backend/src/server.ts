import dotenv from "dotenv";
import { createApp } from "./app";
import connectDB from "./config/db";
import { stopOrphanedRuns } from "./execution/orphanedRuns";
import { ensureIoMonitorImage, finishInterruptedMonitors, removeOrphanedMonitors, waitForStoppingMonitors } from "./monitor/ioMonitor";
import { readFeatures } from "./settings/features";
import { listRunFolders } from "./runs/runIndex";
import { stopAllRuns } from "./execution/runRegistry";
import { STOP_GRACE_MS } from "./execution/runner";

// Load environment variables from .env file (quietly: dotenv 17+ otherwise
// logs a line every time it loads one).
dotenv.config({ quiet: true });

connectDB();

const app = createApp();
const PORT = Number(process.env.PORT) || 5001;
// Only this computer by default: there is no login, and runs can start
// containers on the host's Docker. The Docker image sets HOST=0.0.0.0 so the
// frontend container can reach it; its published ports stay on 127.0.0.1.
const HOST = process.env.HOST || "127.0.0.1";

const server = app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});

// Runs an earlier backend left going (it was killed or restarted) are
// stopped and recorded as interrupted.
stopOrphanedRuns().then(
  (count) => count > 0 && console.log(`Stopped what was left of ${count} interrupted run(s).`),
  (error: unknown) => console.warn("Could not check for interrupted runs:", error)
);
// I/O monitors of those runs run until stopped: their logs are kept.
// Then their summaries, and those of monitors that stopped with N-WAVE before
// they were written, are finished from their logs.
removeOrphanedMonitors()
  .then((count) => {
    if (count > 0) console.log(`Stopped ${count} I/O monitor(s) of interrupted runs.`);
    const finished = finishInterruptedMonitors(listRunFolders());
    if (finished > 0) console.log(`Finished the I/O monitor's summary of ${finished} interrupted run(s).`);
  })
  .catch((error: unknown) => console.warn("Could not check for I/O monitors left running:", error));

// With the I/O monitor on (by the switch, or fixed by NWAVE_FEATURES), its image
// is downloaded now if it isn't here, so the first monitored run doesn't wait.
if (readFeatures().features.ioMonitor) void ensureIoMonitorImage();

// On `docker stop` or Ctrl-C, stop the runs (they record why) before going.
// Without this, Nextflow would go on alone: in its own container or process
// group. Node as a container's PID 1 also doesn't exit on SIGTERM by itself.
let shuttingDown = false;
// Within Docker's stop_grace_period (45 s in the compose files) in most cases;
// a monitor that takes longer is finished at the next start.
const MONITOR_STOP_MS = 15_000;
const shutDown = (signal: NodeJS.Signals) => {
  if (shuttingDown) process.exit(1);
  shuttingDown = true;
  console.log(`${signal}: stopping runs before shutting down.`);
  server.close();
  // The I/O monitors of those runs write their summaries as they stop.
  stopAllRuns(STOP_GRACE_MS + 10_000)
    .then(() => waitForStoppingMonitors(MONITOR_STOP_MS))
    .finally(() => process.exit(0));
};
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
