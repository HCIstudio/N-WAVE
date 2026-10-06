import { exec, spawn } from "node:child_process";
import { shellQuote } from "./command";

// Runs a Nextflow command for as long as it needs: output is streamed (no
// buffer limit), and the run can be stopped by a time limit or a cancel.
// Stopping signals the whole process group (Nextflow and its tasks) and,
// when Nextflow runs in a container, stops that container too.

export type StopReason = "cancelled" | "timeout";

export interface RunExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  /** Set when the run was stopped rather than finishing on its own. */
  stopReason: StopReason | null;
  /** The last part of the run's output, for diagnosing failures. */
  outputTail: string;
}

export interface RunHandle {
  /** Stop the run (no-op once it has ended). */
  stop: (reason: StopReason) => void;
}

/** How long a stopped run gets to clean up before it is killed. */
export const STOP_GRACE_MS = 30_000;

const OUTPUT_TAIL_LENGTH = 1_000_000;

export const startRun = ({
  command,
  cwd,
  timeoutMs,
  containerName,
  onOutput,
  onExit,
}: {
  command: string;
  cwd: string;
  /** 0 for no time limit. */
  timeoutMs: number;
  /** Name of the Nextflow runner container, when there is one. */
  containerName?: string;
  onOutput: (chunk: string) => void;
  onExit: (exit: RunExit) => void;
}): RunHandle => {
  const isWindows = process.platform === "win32";
  const child = spawn(command, {
    cwd,
    shell: true,
    // Own process group, so stopping reaches Nextflow and its tasks.
    detached: !isWindows,
  });
  let outputTail = "";
  let stopReason: StopReason | null = null;
  let ended = false;
  let killTimer: NodeJS.Timeout | undefined;

  const record = (data: Buffer) => {
    const chunk = data.toString();
    outputTail = (outputTail + chunk).slice(-OUTPUT_TAIL_LENGTH);
    onOutput(chunk);
  };
  child.stdout?.on("data", record);
  child.stderr?.on("data", record);

  const signalGroup = (signal: NodeJS.Signals) => {
    if (!child.pid || ended) return;
    try {
      if (isWindows) {
        exec(`taskkill /pid ${child.pid} /t /f`);
      } else {
        process.kill(-child.pid, signal);
      }
    } catch {
      // Already gone.
    }
  };

  const stop = (reason: StopReason) => {
    if (ended || stopReason) return;
    stopReason = reason;
    if (containerName) {
      exec(`docker stop -t ${STOP_GRACE_MS / 1000} ${shellQuote(containerName)}`);
    }
    signalGroup("SIGTERM");
    killTimer = setTimeout(() => signalGroup("SIGKILL"), STOP_GRACE_MS + 5_000);
    killTimer.unref();
  };

  const timeoutTimer =
    timeoutMs > 0 ? setTimeout(() => stop("timeout"), timeoutMs) : undefined;
  timeoutTimer?.unref();

  const finish = (code: number | null, signal: NodeJS.Signals | null) => {
    if (ended) return;
    ended = true;
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (killTimer) clearTimeout(killTimer);
    onExit({ code, signal, stopReason, outputTail });
  };
  child.on("close", finish);
  child.on("error", (error) => {
    record(Buffer.from(`\nExecution error: ${error.message}\n`));
    finish(1, null);
  });

  return { stop };
};
