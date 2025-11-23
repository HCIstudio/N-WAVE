// backend/src/routes/executeRoutes.ts
import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { executeProcess, checkDockerStatus, cancelExecution } from "../controllers/executeController";

const router = express.Router();

function pickRoot(): string {
  const envRoot = process.env.RESULTS_ROOT || process.env.NWAVE_RESULTS_DIR;
  if (envRoot && envRoot.trim()) return path.resolve(envRoot);
  if (fs.existsSync("/nwave-share")) return "/nwave-share";
  if (fs.existsSync("/backend/results")) return "/backend/results";
  return path.resolve(__dirname, "..", "..", "results");
}

type RunMeta = {
  state?: "started" | "running" | "succeeded" | "failed";
  startedAt?: string;
  endedAt?: string;
  exitCode?: number;
  overallProgress?: number | string;
};

function readJsonSafe(p: string): any | null {
  try {
    const s = fs.readFileSync(p, "utf-8");
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function computeProgressFromMarkers(runDir: string): number | undefined {
  const marker = path.join(runDir, "nextflow", "progress.json");
  try {
    const s = fs.readFileSync(marker, "utf-8");
    const j = JSON.parse(s);
    const n = Number(j?.progress);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, Math.round(n)));
  } catch {}
  return undefined;
}

const statusHandler = (req: Request, res: Response) => {
  const runId = String(req.query.runId || req.query.id || "");
  const root = pickRoot();
  const runDir = path.join(root, runId);
  const metaPath = path.join(runDir, "nextflow", "status.json");
  const meta = (readJsonSafe(metaPath) || {}) as RunMeta;

  let overallProgress: number | string | undefined = meta.overallProgress;
  const markers = computeProgressFromMarkers(runDir);
  if (overallProgress == null && typeof markers === "number") {
    overallProgress = markers;
  }

  const state = (meta.state as any) || "running";
  const startedAt = meta.startedAt ? new Date(meta.startedAt).toISOString() : undefined;
  const endedAt = meta.endedAt ? new Date(meta.endedAt).toISOString() : undefined;
  const exitCode = meta.exitCode;

  if ((state === "succeeded" || state === "failed") && overallProgress == null) {
    overallProgress = 100;
  }

  res.json({ ok: true, runId, state, overallProgress, startedAt, endedAt, exitCode });
};

// ---------- Routes ----------

// Start run (new)
router.post("/run", executeProcess);
// Start run (legacy alias used by current frontend)
router.post("/execute", executeProcess);
// Even-more-legacy alias: /api/execute/execute
router.post("/execute/execute", executeProcess);

// Cancel + docker
router.post("/cancel", cancelExecution);
router.get("/docker-status", checkDockerStatus);

// Status paths (support all variants)
router.get("/status", statusHandler);
router.get("/nextflow-status", statusHandler);
router.get("/nextflow/status", statusHandler);

export default router;
