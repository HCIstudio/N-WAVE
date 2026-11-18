// The I/O monitor next to a run (opt-in, Global Settings → I/O monitor): the
// eBPF monitor of Witzke et al. ("Low-level I/O Monitoring for Scientific
// Workflows", https://arxiv.org/abs/2408.00411; their code:
// https://github.com/CRC-FONDA/workflow-monitoring), in its own image
// (backend/monitor). It starts as a privileged container before Nextflow,
// records every file access under the run's folder, and stops after the run.
// Its logs stay in the run's folder (nwave_monitor/<run>/) and go with it.
//
//   NWAVE_IO_MONITOR=off            the installation never runs it
//   NWAVE_IO_MONITOR_IMAGE=…        the image (default nwave-iomonitor:dev)
//   NWAVE_IO_MONITOR_START_TIMEOUT  seconds to wait for its probes (default 180)

import { type ChildProcess, exec, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { checkWorkFolders, openedPaths, type WorkFoldersCheck } from "./workFolders";
import { shellQuote } from "../execution/command";
import { readCommandOutput } from "../execution/shell";

/** Runs a command; whether it worked, with its error output. */
const runShell = (command: string, timeout: number): Promise<{ ok: boolean; stderr: string }> =>
  new Promise((resolve) =>
    exec(command, { timeout }, (error, _stdout, stderr) =>
      resolve({ ok: !error, stderr: String(stderr) || (error?.killed ? "timed out" : "") }),
    ),
  );

export const IO_MONITOR_IMAGE = "nwave-iomonitor:dev";

/** The run's monitor folder, relative to the run's directory. */
export const monitorDir = (runId: string): string => `nwave_monitor/${runId}`;

export const MONITOR_FILES = {
  accesses: "file-bpf.csv",
  processes: "cgroups.csv",
  log: "monitor.log",
  summary: "monitor.json",
} as const;

export interface IoMonitorConfig {
  /** False when NWAVE_IO_MONITOR=off. */
  allowed: boolean;
  image: string;
  startTimeoutMs: number;
}

export const readIoMonitorConfig = (env: NodeJS.ProcessEnv = process.env): IoMonitorConfig => {
  const seconds = Number(env.NWAVE_IO_MONITOR_START_TIMEOUT);
  return {
    allowed: !["off", "false", "0", "no"].includes((env.NWAVE_IO_MONITOR ?? "").trim().toLowerCase()),
    image: env.NWAVE_IO_MONITOR_IMAGE?.trim() || IO_MONITOR_IMAGE,
    startTimeoutMs: (Number.isFinite(seconds) && seconds > 0 ? seconds : 180) * 1000,
  };
};

/** What a run's monitor did, kept as monitor.json next to its logs. */
export interface MonitorSummary {
  /** running: on for a run that goes on; then recorded, or why not. */
  status: "running" | "recorded" | "unavailable" | "failed";
  /** Why it couldn't run, or what went wrong. */
  reason?: string;
  /** The kernel it ran on (uname -r). */
  kernel?: string;
  startedAt?: string;
  stoppedAt?: string;
  /** Files the run wrote with write(), checked against their size on disk. */
  checkedFiles?: number;
  /** Of those, files with fewer bytes recorded than on disk: events were lost. */
  incompleteFiles?: number;
  missingBytes?: number;
  /** The files in the steps' work folders, and those the monitor saw no open of (workFolders.ts). */
  workFolders?: WorkFoldersCheck;
  /** Lines in the logs (without headers). */
  accesses?: number;
  processes?: number;
  /** The authors' commit the image was built from. */
  upstreamCommit?: string;
}

/** The run's folder as the kernel names it (the entrypoint writes it to monitor.log). */
export const readMonitorPrefix = (log: string): string | null => log.match(/^prefix: (.+) \(depth \d+\)$/m)?.[1] ?? null;

/** O_ACCMODE bits of an open: 0 read-only, 1 write-only, 2 read and write. */
const writes = (flags: number) => (flags & 0b11) !== 0;

/**
 * Whether events were lost. The monitor's buffers drop events silently when
 * its programs fall behind, and on a busy computer it can record a path for
 * the wrong open. So N-WAVE checks what it can: a file the run wrote with
 * write() has as many bytes on disk as the monitor recorded it write. A file
 * with fewer recorded bytes (but some) lost write events, or got them
 * recorded under another file.
 * Files written another way (copied with copy_file_range, mapped) have no
 * recorded writes and aren't counted.
 */
export const checkRecordedWrites = (
  accessLog: string,
  prefix: string,
  sizeOf: (relativePath: string) => number | null,
): { files: number; incomplete: number; missingBytes: number } => {
  // A write belongs to the file its handle was last opened for (their
  // handle ids get reused, and their inode ids don't always match the open).
  const written = new Map<string, { path: string; bytes: number }>();
  const openOfHandle = new Map<string, string | null>();
  for (const line of accessLog.split("\n")) {
    const fields = line.split(",");
    if (fields.length < 15 || !/^\s*\d/.test(fields[0] ?? "")) continue;
    const handle = (fields[10] ?? "").trim();
    const type = (fields[8] ?? "").trim();
    if (type === "O") {
      const path = fields.slice(14).join(",").split(":")[0]?.trim() ?? "";
      // N-WAVE's own files (the monitor's summary) aren't the run's.
      const checked =
        writes(Number.parseInt((fields[13] ?? "0").trim(), 16)) &&
        path.startsWith(`${prefix}/`) &&
        !path.startsWith(`${prefix}/nwave_monitor/`);
      openOfHandle.set(handle, checked ? path.slice(prefix.length + 1) : null);
    } else if (type === "W") {
      const result = Number(fields[9]);
      const path = openOfHandle.get(handle);
      if (path && result > 0) {
        const entry = written.get(path) ?? { path, bytes: 0 };
        entry.bytes += result;
        written.set(path, entry);
      }
    }
  }
  let incomplete = 0;
  let missingBytes = 0;
  for (const { path, bytes } of written.values()) {
    const size = sizeOf(path);
    if (size !== null && bytes < size) {
      incomplete += 1;
      missingBytes += size - bytes;
    }
  }
  return { files: written.size, incomplete, missingBytes };
};

/** The ready or unavailable line the entrypoint prints, if this is one. */
export const parseMonitorLine = (
  line: string,
): { ready: true; kernel: string } | { ready: false; reason: string } | null => {
  const ready = line.match(/^NWAVE-MONITOR ready (\S+)/);
  if (ready) return { ready: true, kernel: ready[1] ?? "" };
  const unavailable = line.match(/^NWAVE-MONITOR unavailable (.+)$/);
  if (unavailable) return { ready: false, reason: (unavailable[1] ?? "").trim() };
  return null;
};

export const monitorContainerName = (runId: string): string =>
  `nwave-iomonitor-${runId.replace(/[^a-zA-Z0-9_.-]/g, "_")}`.slice(0, 120);

/**
 * `docker run` arguments: privileged in the host's process namespace (eBPF
 * sees every process; the cgroup ids are the host's), with the run's results
 * volume and the host's kernel headers where it has them.
 */
export const buildMonitorDockerArgs = (options: {
  image: string;
  containerName: string;
  /**
   * How the results get into the container: the backend's volumes (at the
   * backend's own mount point), or a folder of this computer.
   */
  results: { volumesFrom: string } | { bind: string };
  /** Where the results are in the container. */
  mountPoint: string;
  runFolder: string;
  outputFolder: string;
}): string[] => [
  "run",
  "-d",
  "--name",
  options.containerName,
  "--label",
  "nwave.iomonitor=1",
  "--privileged",
  "--pid=host",
  ...("volumesFrom" in options.results
    ? ["--volumes-from", options.results.volumesFrom]
    : ["--mount", `type=bind,source=${options.results.bind},target=${options.mountPoint}`]),
  "-v",
  "/lib/modules:/lib/modules:ro",
  "-v",
  "/usr/src:/usr/src:ro",
  options.image,
  options.mountPoint,
  options.runFolder,
  options.outputFolder,
];

export interface IoMonitorStatus {
  /** Whether a run with the monitor switched on gets it. */
  available: boolean;
  reason?: string;
  image: string;
  imagePresent: boolean;
  /** Docker's kernel and system (the monitor's platform). */
  kernel?: string;
  system?: string;
}

/** Whether the monitor can run on this installation, with why not. */
export const getIoMonitorStatus = async (config = readIoMonitorConfig()): Promise<IoMonitorStatus> => {
  const base = { image: config.image, imagePresent: false };
  if (!config.allowed) {
    return { ...base, available: false, reason: "The I/O monitor is switched off on this installation (NWAVE_IO_MONITOR=off)." };
  }
  const info = await readCommandOutput("docker info --format '{{.KernelVersion}}|{{.OperatingSystem}}'");
  if (!info) return { ...base, available: false, reason: "Docker isn't available." };
  const [kernel, system] = info.trim().split("|");
  const present = await runShell(`docker image inspect ${shellQuote(config.image)}`, 30_000);
  if (!present.ok) {
    return {
      ...base,
      kernel,
      system,
      available: false,
      reason: `The monitor's image ${config.image} isn't on this computer. Build it with \`docker compose --profile monitor build iomonitor\`.`,
    };
  }
  return { ...base, imagePresent: true, kernel, system, available: true };
};

/** A monitor that runs next to a run. */
export interface RunningMonitor {
  kernel: string;
  /** Stops it, keeps its logs and says what it recorded. */
  stop: () => Promise<MonitorSummary>;
}

const lineCount = (file: string): number => {
  try {
    const text = fs.readFileSync(file, "utf8");
    return text.split("\n").filter((line) => line.trim() && !/^\s*time/.test(line)).length;
  } catch {
    return 0;
  }
};

export const writeMonitorSummary = (outDir: string, summary: MonitorSummary): void => {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, MONITOR_FILES.summary), `${JSON.stringify(summary, null, 1)}\n`);
};

export const readMonitorSummary = (runDir: string, runId: string): MonitorSummary | null => {
  try {
    return JSON.parse(fs.readFileSync(path.join(runDir, monitorDir(runId), MONITOR_FILES.summary), "utf8")) as MonitorSummary;
  } catch {
    return null;
  }
};

/** Waits for the entrypoint's line in the container's log. */
const waitForReady = (
  containerName: string,
  timeoutMs: number,
): Promise<{ ready: true; kernel: string } | { ready: false; reason: string }> =>
  new Promise((resolve) => {
    let settled = false;
    let buffer = "";
    const logs: ChildProcess = spawn("docker", ["logs", "-f", containerName]);
    const finish = (value: { ready: true; kernel: string } | { ready: false; reason: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      logs.kill();
      resolve(value);
    };
    const timer = setTimeout(
      () => finish({ ready: false, reason: `its probes didn't load within ${Math.round(timeoutMs / 1000)} s` }),
      timeoutMs,
    );
    logs.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      for (const line of buffer.split("\n")) {
        const parsed = parseMonitorLine(line.trim());
        if (parsed) finish(parsed);
      }
      buffer = buffer.slice(buffer.lastIndexOf("\n") + 1);
    });
    logs.on("exit", () => finish({ ready: false, reason: "it stopped before its probes were loaded" }));
  });

/**
 * Starts the monitor for a run; null (with the reason written to the run's
 * monitor.json and passed to `say`) when it can't run. The run goes on
 * either way.
 */
export const startIoMonitor = async (options: {
  runId: string;
  runDir: string;
  /** The results folder inside the backend, and how the monitor gets it. */
  resultsRoot: string;
  results: { volumesFrom: string } | { bind: string };
  say: (line: string) => void;
  config?: IoMonitorConfig;
}): Promise<RunningMonitor | null> => {
  const config = options.config ?? readIoMonitorConfig();
  const outRel = monitorDir(options.runId);
  const outDir = path.join(options.runDir, outRel);
  const startedAt = new Date().toISOString();
  const status = await getIoMonitorStatus(config);
  const giveUp = (reason: string): null => {
    writeMonitorSummary(outDir, { status: "unavailable", reason, kernel: status.kernel, startedAt });
    options.say(`N-WAVE: the I/O monitor can't run here: ${reason} The run goes on without it.\n`);
    return null;
  };
  if (!status.available) return giveUp(status.reason ?? "it isn't available.");

  const containerName = monitorContainerName(options.runId);
  await runShell(`docker rm -f ${shellQuote(containerName)}`, 30_000);
  const runFolder = path.relative(options.resultsRoot, options.runDir).split(path.sep).join("/");
  const args = buildMonitorDockerArgs({
    image: config.image,
    containerName,
    results: options.results,
    // --volumes-from mounts the backend's volume where the backend has it.
    mountPoint: "volumesFrom" in options.results ? options.resultsRoot : "/nwave-results",
    runFolder,
    outputFolder: path.posix.join(runFolder, outRel),
  });
  options.say("N-WAVE: starting the I/O monitor (it loads its probes into the kernel) …\n");
  const started = await runShell(`docker ${args.map(shellQuote).join(" ")}`, 120_000);
  if (!started.ok) return giveUp(`its container didn't start (${started.stderr.trim().split("\n").pop() ?? "docker run failed"}).`);
  const ready = await waitForReady(containerName, config.startTimeoutMs);
  if (!ready.ready) {
    await runShell(`docker rm -f ${shellQuote(containerName)}`, 30_000);
    return giveUp(`${ready.reason.replace(/\.$/, "")}.`);
  }
  writeMonitorSummary(outDir, { status: "running", kernel: ready.kernel, startedAt });
  options.say(`N-WAVE: the I/O monitor is on (kernel ${ready.kernel}); it records the file accesses under this run's folder.\n`);

  let stopped: Promise<MonitorSummary> | null = null;
  const stop = (): Promise<MonitorSummary> => {
    stopped ??= (async () => {
      // The entrypoint stops both programs; their logs are written as they go.
      await runShell(`docker kill --signal INT ${shellQuote(containerName)}`, 30_000);
      const waited = await runShell(`docker wait ${shellQuote(containerName)}`, 90_000);
      if (!waited.ok) await runShell(`docker kill ${shellQuote(containerName)}`, 30_000);
      await runShell(`docker rm -f ${shellQuote(containerName)}`, 30_000);
      let log = "";
      let accessLog = "";
      try {
        log = fs.readFileSync(path.join(outDir, MONITOR_FILES.log), "utf8");
        accessLog = fs.readFileSync(path.join(outDir, MONITOR_FILES.accesses), "utf8");
      } catch {
        // No logs: the summary says what is known.
      }
      const prefix = readMonitorPrefix(log);
      const check = prefix
        ? checkRecordedWrites(accessLog, prefix, (relative) => {
            try {
              return fs.statSync(path.join(options.runDir, relative)).size;
            } catch {
              return null;
            }
          })
        : { files: 0, incomplete: 0, missingBytes: 0 };
      const workFolders = prefix
        ? checkWorkFolders(options.runDir, openedPaths(accessLog, prefix), Date.parse(startedAt))
        : undefined;
      const summary: MonitorSummary = {
        status: "recorded",
        kernel: ready.kernel,
        startedAt,
        stoppedAt: new Date().toISOString(),
        accesses: lineCount(path.join(outDir, MONITOR_FILES.accesses)),
        processes: lineCount(path.join(outDir, MONITOR_FILES.processes)),
        checkedFiles: check.files,
        incompleteFiles: check.incomplete,
        missingBytes: check.missingBytes,
        workFolders,
      };
      writeMonitorSummary(outDir, summary);
      return summary;
    })();
    return stopped;
  };
  return { kernel: ready.kernel, stop };
};

/** What the run's log says once the monitor stopped. */
export const describeMonitorSummary = (summary: MonitorSummary): string => {
  if (summary.status !== "recorded") return `N-WAVE: the I/O monitor didn't record this run: ${summary.reason ?? "unknown reason"}\n`;
  const lost = summary.incompleteFiles
    ? ` For ${summary.incompleteFiles} of the ${summary.checkedFiles} files the run wrote, it recorded fewer bytes than the files have (${summary.missingBytes} bytes): events were lost, or recorded for another file.`
    : "";
  const folders = summary.workFolders;
  const missed = folders?.files
    ? folders.missed
      ? ` Of the ${folders.files} files in the steps' work folders, it saw no open of ${folders.missed}: their accesses were lost.`
      : ` It saw all ${folders.files} files in the steps' work folders.`
    : "";
  return `N-WAVE: the I/O monitor recorded ${summary.accesses ?? 0} file accesses and ${summary.processes ?? 0} process starts.${lost}${missed}\n`;
};

/** Monitors left behind by a backend that stopped (they run until stopped). */
export const removeOrphanedMonitors = async (): Promise<number> => {
  const list = await readCommandOutput("docker ps -aq --filter label=nwave.iomonitor=1");
  const ids = (list ?? "").split(/\s+/).filter(Boolean);
  for (const id of ids) {
    await runShell(`docker kill --signal INT ${shellQuote(id)}`, 30_000);
    await runShell(`docker wait ${shellQuote(id)}`, 60_000);
    await runShell(`docker rm -f ${shellQuote(id)}`, 30_000);
  }
  return ids.length;
};
