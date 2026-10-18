// Recorded runs: their history, logs, results and what each task produced.

import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { isRunLive } from "../execution/runRegistry";
import {
  findRunDir,
  findRunLog,
  findRunResultsDir,
  listFiles,
  listRuns,
  realFileInRun,
} from "../runs/runIndex";
import { findTaskWorkDir, listTaskOutputs, readRunTasks } from "../runs/taskEvents";

/** HTML reports (MultiQC) run their scripts, but without access to this origin. */
const sendSandboxed = (res: Response, file: string): void => {
  res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-popups");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(file);
};

const parseRunId = (req: Request, res: Response): string | null => {
  const id = String(req.params.id ?? "");
  if (!/^[A-Za-z0-9_-]{1,300}$/.test(id)) {
    res.status(400).json({ message: "Invalid run id" });
    return null;
  }
  return id;
};

/** Recorded runs, newest first; `?workflowId=` limits them to one workflow. */
export const listRunsHandler = (req: Request, res: Response): void => {
  const workflowId =
    typeof req.query.workflowId === "string" ? req.query.workflowId : undefined;
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  res.json({ runs: listRuns({ workflowId, limit, isLive: isRunLive }) });
};

/** A recorded run's full output, as the run panel showed it. */
export const getRunLog = (req: Request, res: Response): void => {
  const id = parseRunId(req, res);
  if (!id) return;
  const file = findRunLog(id);
  if (!file) {
    res.status(404).json({ message: `No log for run ${id}` });
    return;
  }
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(file).pipe(res);
};

/** `{ files }`: the files in a run's results directory. */
export const listRunResultFiles = (req: Request, res: Response): void => {
  const id = parseRunId(req, res);
  if (!id) return;
  const dir = findRunResultsDir(id);
  if (!dir) {
    res.status(404).json({ message: `No results for run ${id}` });
    return;
  }
  res.json({ id, files: listFiles(dir, undefined, findRunDir(id) ?? dir) });
};

/** One file from a run's results. */
export const getRunResultFile = (req: Request, res: Response): void => {
  const id = parseRunId(req, res);
  if (!id) return;
  const dir = findRunResultsDir(id);
  const runDir = findRunDir(id);
  const relative = typeof req.query.path === "string" ? req.query.path : "";
  const target = path.resolve(dir ?? "", relative);
  // Followed symlinks must stay inside the run.
  const real =
    dir &&
    runDir &&
    relative &&
    target.startsWith(`${path.resolve(dir)}${path.sep}`)
      ? realFileInRun(runDir, target)
      : null;
  if (!real) {
    res.status(404).json({ message: "Result file not found" });
    return;
  }
  sendSandboxed(res, real);
};

/** `{ tasks }`: what each task of a run is doing, from Nextflow's log. */
export const listRunTasks = (req: Request, res: Response): void => {
  const id = parseRunId(req, res);
  if (!id) return;
  const dir = findRunDir(id);
  if (!dir) {
    res.status(404).json({ message: `Unknown run ${id}` });
    return;
  }
  res.json({ id, tasks: readRunTasks(dir) });
};

/** A task's work directory (and its run's), from the run id and its hash in the URL. */
const resolveTaskDir = (
  req: Request,
  res: Response
): { runDir: string; workDir: string } | null => {
  const id = parseRunId(req, res);
  if (!id) return null;
  const hash = `${req.params.prefix ?? ""}/${req.params.rest ?? ""}`;
  const runDir = findRunDir(id);
  const workDir = runDir ? findTaskWorkDir(runDir, hash) : null;
  if (!runDir || !workDir) {
    res.status(404).json({ message: `No work directory for task ${hash}` });
    return null;
  }
  return { runDir, workDir };
};

/** `{ files }`: the files a task produced. */
export const listRunTaskFiles = (req: Request, res: Response): void => {
  const task = resolveTaskDir(req, res);
  if (task) res.json({ files: listTaskOutputs(task.workDir) });
};

/** One file a task produced (served like result files). */
export const getRunTaskFile = (req: Request, res: Response): void => {
  const task = resolveTaskDir(req, res);
  if (!task) return;
  const { runDir, workDir } = task;
  const relative = typeof req.query.path === "string" ? req.query.path : "";
  const target = path.resolve(workDir, relative);
  const inside =
    relative &&
    !relative.split(/[\\/]/).some((part) => part.startsWith(".")) &&
    target.startsWith(`${path.resolve(workDir)}${path.sep}`);
  // Staged inputs are symlinks that may point anywhere: only serve what
  // resolves inside the run.
  const real = inside ? realFileInRun(runDir, target) : null;
  if (!real) {
    res.status(404).json({ message: "Task file not found" });
    return;
  }
  sendSandboxed(res, real);
};
