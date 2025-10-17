// helpers/nextflow.ts
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const SHARED = "/shared";                       // named volume, same path in backend & dind
const DEFAULT_IMAGE = process.env.NXF_IMAGE || "ubuntu:22.04";

function pickLatestWorkflowDir(base = "/backend/results"): string {
  // scan /backend/results/*/workflow and pick newest
  const root = base;
  if (!fs.existsSync(root)) throw new Error(`Results root missing: ${root}`);
  const entries = fs.readdirSync(root)
    .map(name => path.join(root, name, "workflow"))
    .filter(p => fs.existsSync(p) && fs.statSync(p).isDirectory())
    .map(p => ({ p, t: fs.statSync(p).mtimeMs }))
    .sort((a,b) => b.t - a.t);
  if (!entries.length) throw new Error("No generated workflow folder found");
  return entries[0].p;
}

export function resolveProjectDir(jobId?: string): string {
  return jobId
    ? path.posix.join("/backend", "results", jobId, "workflow")
    : pickLatestWorkflowDir();
}

export function runNextflowProject(projectDir: string, mainScript = "Untitled_Workflow.nf"): Promise<void> {
  const outDir   = path.posix.join(SHARED, "data", String(Date.now()));
  const workDir  = path.posix.join(SHARED, "work");
  fs.mkdirSync(outDir, { recursive: true });

  const args = [
    "run", projectDir,             // ← local folder, NOT “workflow”
    "-main-script", mainScript,    // file inside that folder
    "-with-docker", DEFAULT_IMAGE, // guarantee an image even if profile missing
    "-work-dir", workDir,
    "-with-report", path.posix.join(outDir, "report.html"),
    "-with-timeline", path.posix.join(outDir, "timeline.html"),
    "-with-trace", path.posix.join(outDir, "trace.txt"),
    "-profile", "docker"           // let your nextflow.config add docker settings
  ];

  console.log("[Nextflow] nextflow", args.join(" "));

  const child = spawn("nextflow", args, {
    cwd: "/backend",
    env: {
      ...process.env,
      DOCKER_HOST: process.env.DOCKER_HOST || "tcp://dind:2375",
      NXF_HOME: process.env.NXF_HOME || "/backend/.nextflow",
    }
  });

  child.stdout.on("data", d => process.stdout.write(d));
  child.stderr.on("data", d => process.stderr.write(d));

  return new Promise((resolve, reject) => {
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`Nextflow exited ${code}`)));
    child.on("error", reject);
  });
}
