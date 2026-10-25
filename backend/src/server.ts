import dotenv from "dotenv";
import { createApp } from "./app";
import connectDB from "./config/db";
import { stopOrphanedRuns } from "./execution/orphanedRuns";
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

// On `docker stop` or Ctrl-C, stop the runs (they record why) before going.
// Without this, Nextflow would go on alone: in its own container or process
// group. Node as a container's PID 1 also doesn't exit on SIGTERM by itself.
let shuttingDown = false;
const shutDown = (signal: NodeJS.Signals) => {
  if (shuttingDown) process.exit(1);
  shuttingDown = true;
  console.log(`${signal}: stopping runs before shutting down.`);
  server.close();
  stopAllRuns(STOP_GRACE_MS + 10_000).finally(() => process.exit(0));
};
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);
