import { exec } from "node:child_process";

/** Whether a command runs successfully (e.g. "docker info"). */
export const isCommandAvailable = (command: string): Promise<boolean> =>
  new Promise((resolve) => exec(command, (error) => resolve(!error)));

/** A command's trimmed output, or undefined when it fails. */
export const readCommandOutput = (command: string): Promise<string | undefined> =>
  new Promise((resolve) =>
    exec(command, { timeout: 15_000 }, (error, stdout) =>
      resolve(error ? undefined : String(stdout).trim())
    )
  );

/** A command's trimmed output; rejects with its stderr when it fails. */
export const execOutput = (command: string): Promise<string> =>
  new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
