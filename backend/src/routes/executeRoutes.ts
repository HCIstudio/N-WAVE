// backend/src/routes/executeRoutes.ts — v10.4.1 (noImplicitReturns-safe)
import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { executeProcess, checkDockerStatus, cancelExecution } from "../controllers/executeController";

const router = express.Router();

const pickRoot = (): string => {
  const envRoot = process.env.RESULTS_ROOT || process.env.NWAVE_RESULTS_DIR;
  if (envRoot && envRoot.trim()) return path.resolve(envRoot);
  return path.resolve(__dirname, "..", "..", "results");
};
const RESULTS_ROOT = pickRoot();

router.use((req, _res, next): void => {
  try {
    fs.mkdirSync(RESULTS_ROOT, { recursive: true });
    fs.appendFileSync(path.join(RESULTS_ROOT, "__tap_router.log"), `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}\n`);
  } catch {}
  next();
});

router.use(express.json({ limit: "200mb", strict: false }));

router.post("/execute", executeProcess);
router.get("/docker/status", checkDockerStatus);

// Richer status endpoint with explicit void returns to satisfy noImplicitReturns
router.get("/nextflow/status", (req: Request, res: Response): void => {
  const runId = typeof req.query.runId === "string" ? req.query.runId : null;
  if (!runId) {
    // list runs with status if available
    const entries = fs.readdirSync(RESULTS_ROOT, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name);
    const list = entries.map(name => {
      const statusFile = path.join(RESULTS_ROOT, name, "status.json");
      let state = "unknown";
      if (fs.existsSync(statusFile)) {
        try {
          state = JSON.parse(fs.readFileSync(statusFile, "utf8")).state || "unknown";
        } catch {}
      }
      return { runId: name, state };
    });
    res.json({ ok: true, runs: list });
    return;
  }

  const runDir = path.join(RESULTS_ROOT, runId);
  const statusFile = path.join(runDir, "status.json");
  const traceFile = path.join(runDir, "trace.txt");
  const nfLog = path.join(runDir, "nextflow.log");

  let state: string = "unknown";
  let startedAt: string | undefined;
  let endedAt: string | undefined;
  let exitCode: number | undefined;
  let lastLogAt: string | undefined;

  if (fs.existsSync(statusFile)) {
    try {
      const s = JSON.parse(fs.readFileSync(statusFile, "utf8"));
      state = s.state || state;
      startedAt = s.startedAt;
      endedAt = s.endedAt;
      exitCode = s.exitCode;
      lastLogAt = s.lastLogAt;
    } catch {}
  }

  // progress: if trace.txt exists, use number of data lines
  let tasksDone = 0;
  let tasksTotal = 0;
  if (fs.existsSync(traceFile)) {
    try {
      const lines = fs.readFileSync(traceFile, "utf8").trim().split(/\r?\n/);
      tasksDone = Math.max(0, lines.length - 1);
      tasksTotal = tasksDone; // best effort; if we later detect total, this will increase
    } catch {}
  }
  const finished = state === "succeeded" || state === "failed";
  const percent = finished ? 100 : (tasksTotal > 0 ? Math.min(99, Math.round((tasksDone / tasksTotal) * 100)) : (state === "running" ? 10 : 1));

  // include a short tail of the log for the UI
  let logTail = "";
  if (fs.existsSync(nfLog)) {
    try {
      const buf = fs.readFileSync(nfLog);
      const start = Math.max(0, buf.length - 6000);
      logTail = buf.slice(start).toString("utf8");
    } catch {}
  }

  res.json({
    ok: true,
    runId,
    state,
    finished,
    percent,
    tasksDone,
    tasksTotal,
    startedAt,
    endedAt,
    exitCode,
    lastLogAt,
    logTail
  });
  return;
});

router.post("/cancel", cancelExecution);

export default router;
