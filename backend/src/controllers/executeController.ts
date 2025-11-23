// backend/src/controllers/executeController.ts — v10.4.2 (guards for child stdio)
import type { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import crypto from "crypto";

type RunStatus = {
  runId: string;
  state: "starting" | "running" | "succeeded" | "failed";
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  lastLogAt?: string;
};

function sanitizeName(s?: string, fallback = "Untitled_Workflow"): string {
  const safe = String(s || fallback).replace(/[^A-Za-z0-9._-]+/g, "_");
  return safe || fallback;
}

function pickResultsRoot(): string {
  const envRoot = process.env.RESULTS_ROOT || process.env.NWAVE_RESULTS_DIR;
  if (envRoot && envRoot.trim()) return path.resolve(envRoot);
  if (fs.existsSync("/nwave-share")) return "/nwave-share";
  if (fs.existsSync("/backend/results")) return "/backend/results";
  return path.resolve(__dirname, "..", "..", "results");
}

const RESULTS_ROOT = pickResultsRoot();

function ensureDir(d: string){ fs.mkdirSync(d, { recursive: true }); }
function writeText(f: string, c: string){ ensureDir(path.dirname(f)); fs.writeFileSync(f, c, "utf8"); }
function writeJSON(f: string, o: unknown){ ensureDir(path.dirname(f)); fs.writeFileSync(f, JSON.stringify(o, null, 2), "utf8"); }
function writeBin(f: string, b: Buffer){ ensureDir(path.dirname(f)); fs.writeFileSync(f, b); }
function append(f: string, m: string){ ensureDir(path.dirname(f)); fs.appendFileSync(f, `[${new Date().toISOString()}] ${m}\n`, "utf8"); }

try {
  ensureDir(RESULTS_ROOT);
  writeText(path.join(RESULTS_ROOT, "__controller_loaded.txt"), `[load] RESULTS_ROOT=${RESULTS_ROOT}`);
} catch {}

function makeRunDir(name: string){
  const id = `${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const runDir = path.join(RESULTS_ROOT, `${name}_${id}`);
  const wfDir = path.join(runDir, "workflow");
  const inputsDir = path.join(runDir, "inputs");
  const workDir = path.join(runDir, "nextflow");
  const resultsDir = path.join(runDir, "results");
  ensureDir(wfDir); ensureDir(inputsDir); ensureDir(workDir); ensureDir(resultsDir);
  return { id, runDir, wfDir, inputsDir, workDir, resultsDir };
}

function writeInputFiles(inputsDir: string, fileContent: any, logFile: string): string[] {
  const written: string[] = [];
  if (!fileContent || typeof fileContent !== "object") return written;
  for (const [rawName, content] of Object.entries(fileContent as Record<string, unknown>)) {
    const name = sanitizeName(String(rawName));
    const target = path.join(inputsDir, name);
    try {
      if (typeof content === "string") {
        const m = content.match(/^data:.*;base64,(.*)$/);
        if (m && typeof m[1] === "string") writeBin(target, Buffer.from(m[1], "base64"));
        else writeText(target, content);
      } else if (content && typeof (content as { data?: unknown; encoding?: unknown }).data === "string") {
        const c: { data: string; encoding?: string } = content as any;
        if ((c.encoding || "base64") === "base64") writeBin(target, Buffer.from(c.data, "base64"));
        else writeText(target, String(c.data));
      } else {
        writeText(target, String(content));
      }
      written.push(name);
      append(logFile, `wrote input ${name} -> ${target}`);
    } catch (e) {
      append(logFile, `FAILED to write input ${name}: ${String(e)}`);
    }
  }
  return written;
}

const SAFE_STUB = `nextflow.enable.dsl=2
workflow { }
`;

export function executeProcess(req: Request, res: Response): void {
  const name = sanitizeName((req.body && (req.body as any).workflowName) as string);
  const { id, runDir, wfDir, inputsDir, workDir, resultsDir } = makeRunDir(name);

  append(path.join(RESULTS_ROOT, "__tap_controller.log"), `hit execute name=${name} id=${id}`);

  const body: any = (req.body || {});

  // 1) inputs/
  const writtenNames = writeInputFiles(inputsDir, body.fileContent, path.join(RESULTS_ROOT, "__tap_controller.log"));
  writeText(path.join(runDir, "inputs_list.txt"), writtenNames.join("\n"));

  // 2) workflow/
  const nfPath = path.join(wfDir, `${name}.nf`);
  const provided = (typeof body.nextflowScript === "string" && body.nextflowScript.trim().length) ? body.nextflowScript : SAFE_STUB;
  const script = /^\s*nextflow\.enable\.dsl\s*=\s*2/m.test(provided) ? provided : `nextflow.enable.dsl=2\n${provided}`;
  writeText(nfPath, script);

  try { writeText(path.join(runDir, "request.json"), JSON.stringify(body ?? {}, null, 2)); } catch {}

  // 3) params.json
  const paramsFile = path.join(runDir, "params.json");
  const params = {
    inputdir: "./inputs",
    outputdir: "./results",
    selected_files: writtenNames,
  };
  writeJSON(paramsFile, params);

  // 4) initialize status.json
  const statusFile = path.join(runDir, "status.json");
  const status: RunStatus = {
    runId: `${name}_${id}`,
    state: "starting",
    startedAt: new Date().toISOString(),
  };
  writeJSON(statusFile, status);

  // 5) Nextflow CLI
  const profile = process.env.NF_PROFILE || (body.useDocker ? "docker" : "docker");
  const container = process.env.NF_CONTAINER || (body.useDocker ? String(body.containerImage || "ubuntu:22.04") : "ubuntu:22.04");

  const args: string[] = [
    "run",
    nfPath,
    "-params-file", paramsFile,
    "-work-dir", workDir,
    "-with-report", path.join(runDir, "report.html"),
    "-with-timeline", path.join(runDir, "timeline.html"),
    "-with-trace", path.join(runDir, "trace.txt"),
    "-with-dag", path.join(runDir, "flowchart.png"),
    "-ansi-log", "false"
  ];
  if (profile) args.push("-profile", profile);
  if (container) args.push("-with-docker", container);

  writeText(path.join(runDir, "__nf_cmd.txt"), `nextflow ${args.map(a => JSON.stringify(a)).join(" ")}`);

  const nfLogPath = path.join(runDir, "nextflow.log");
  try {
    const child = spawn("nextflow", args, { cwd: runDir, env: { ...process.env }, stdio: ["ignore","pipe","pipe"] });
    // mark running
    status.state = "running";
    writeJSON(statusFile, status);

    if (child.stdout) {
      child.stdout.on("data", d => {
        fs.appendFileSync(nfLogPath, d.toString());
        status.lastLogAt = new Date().toISOString();
        writeJSON(statusFile, status);
      });
    }
    if (child.stderr) {
      child.stderr.on("data", d => {
        fs.appendFileSync(nfLogPath, d.toString());
        status.lastLogAt = new Date().toISOString();
        writeJSON(statusFile, status);
      });
    }
    child.on("close", code => {
      status.state = code === 0 ? "succeeded" : "failed";
      status.exitCode = code === null ? undefined : code;
      status.endedAt = new Date().toISOString();
      writeJSON(statusFile, status);
      append(path.join(runDir, "__exec.log"), `nextflow exited code=${code}`);
    });
    child.on("error", err => {
      status.state = "failed";
      status.endedAt = new Date().toISOString();
      writeJSON(statusFile, status);
      append(path.join(runDir, "__exec.log"), `spawn error ${String(err)}`);
    });
  } catch (err) {
    status.state = "failed";
    status.endedAt = new Date().toISOString();
    writeJSON(statusFile, status);
    append(path.join(runDir, "__exec.log"), `spawn throw ${String(err)}`);
  }

  // return "started", not "successful"
  res.status(202).json({
    ok: true,
    status: "started",
    runId: `${name}_${id}`,
    resultsDir: RESULTS_ROOT,
    executionId: `${name}_${id}`,
    runDir,
    workflowFile: nfPath,
    paramsFile,
    folders: { inputs: inputsDir, nextflow: workDir, results: resultsDir, workflow: wfDir },
    message: "Workflow started; poll /nextflow/status until state is succeeded/failed."
  });
}
export function checkDockerStatus(_req: Request, res: Response): void { res.status(200).json({ ok: true }); }
export function checkNextflowStatus(_req: Request, res: Response): void { res.status(200).json({ ok: true }); }
export function cancelExecution(_req: Request, res: Response): void { res.status(200).json({ ok: true }); }
