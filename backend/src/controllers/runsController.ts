// Recorded runs: their history, logs, results and what each task produced.

import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { isRunLive } from "../execution/runRegistry";
import {
  findRunDir,
  findRunLog,
  findRunNextflowLog,
  findRunResultsDir,
  listFiles,
  listRuns,
  realFileInRun,
} from "../runs/runIndex";
import { findTaskWorkDir, listTaskOutputs, readRunTasks } from "../runs/taskEvents";
import {
  clearWorkflowCache,
  measureWorkflowCache,
  WorkflowCacheInUseError,
} from "../runs/workflowCache";
import { getErrorMessage } from "../utils/errors";
import { workflowCacheQuerySchema } from "../validation/schemas";

/** HTML reports (MultiQC) run their scripts, but without access to this origin. */
const sendSandboxed = (res: Response, file: string): void => {
  res.setHeader("Content-Security-Policy", "sandbox allow-scripts allow-popups");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.sendFile(file);
};

/**
 * The requested file's path in the run: from the URL (`/results/<path>`,
 * so a report's relative links reach its sibling files) or `?path=`.
 */
const requestedPath = (req: Request): string => {
  const fromUrl = (req.params as Record<string, string | undefined>)[0];
  if (typeof fromUrl === "string" && fromUrl) return fromUrl;
  return typeof req.query.path === "string" ? req.query.path : "";
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

/**
 * A recorded run's output, as the run panel showed it. `?from=<byte>` sends
 * only what was written after that, so a page can follow a run it didn't
 * start (reopened, or after the connection was lost). `X-Run-Live` says
 * whether the run still goes on, `X-Log-End` where to continue from.
 */
export const getRunLog = (req: Request, res: Response): void => {
  const id = parseRunId(req, res);
  if (!id) return;
  const file = findRunLog(id);
  if (!file) {
    res.status(404).json({ message: `No log for run ${id}` });
    return;
  }
  // Checked before the size is read, so a run that ends meanwhile is
  // followed once more and its last lines aren't missed.
  const live = isRunLive(id);
  const size = fs.statSync(file).size;
  const from = Math.min(size, Math.max(0, Math.floor(Number(req.query.from) || 0)));
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Run-Live", live ? "1" : "0");
  res.setHeader("X-Log-End", String(size));
  if (from >= size) {
    res.end();
    return;
  }
  fs.createReadStream(file, { start: from, end: size - 1 }).pipe(res);
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
  const relative = requestedPath(req);
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
  res.json({ id, tasks: readRunTasks(dir, findRunNextflowLog(id)) });
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
  const relative = requestedPath(req);
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

const parseWorkflowId = (req: Request, res: Response): string | null => {
  const parsed = workflowCacheQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "workflowId is required" });
    return null;
  }
  return parsed.data.workflowId;
};

/** `{ bytes, folders }`: what a workflow's run cache takes up (see workflowCache.ts). */
export const getWorkflowCache = async (req: Request, res: Response): Promise<void> => {
  const workflowId = parseWorkflowId(req, res);
  if (workflowId) res.json(await measureWorkflowCache(workflowId));
};

/** Delete a workflow's run cache; 409 while one of its runs is going. */
export const deleteWorkflowCache = async (req: Request, res: Response): Promise<void> => {
  const workflowId = parseWorkflowId(req, res);
  if (!workflowId) return;
  try {
    await clearWorkflowCache(workflowId, isRunLive);
    res.json(await measureWorkflowCache(workflowId));
  } catch (error: unknown) {
    res
      .status(error instanceof WorkflowCacheInUseError ? 409 : 500)
      .json({ message: getErrorMessage(error) });
  }
};
