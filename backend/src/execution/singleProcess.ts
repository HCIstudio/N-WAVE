// The legacy single-process run: one shell script with $name placeholders,
// run on the host or in a container, answered as JSON.

import { exec } from "node:child_process";
import type { Response } from "express";

// Input values by node, for the node's next run.
const inputCache: Record<string, Record<string, unknown>> = {};

export const rememberInputs = (
  nodeId: string,
  inputs: Array<{ name: string; value?: unknown }>
): void => {
  inputCache[nodeId] = Object.fromEntries(
    inputs.map((input) => [input.name, input.value])
  );
};

/** The script with each $name replaced by the node's quoted input value. */
export const fillPlaceholders = (script: string, nodeId: string): string => {
  let filled = script;
  for (const [key, raw] of Object.entries(inputCache[nodeId] ?? {})) {
    // Basic protection against command injection, but this is NOT foolproof.
    const value = String(raw).replace(/'/g, "'\\''");
    filled = filled.replace(new RegExp(`\\$${key}`, "g"), `'${value}'`);
  }
  return filled;
};

export const executeSingleProcess = (
  script: string,
  nodeId: string,
  useDocker: boolean,
  containerImage: string,
  res: Response
): void => {
  const finalScript = fillPlaceholders(script, nodeId);
  // In a container, the server's working directory is mounted as /workspace.
  const command = useDocker
    ? `docker run --rm -v "${process.cwd()}:/workspace" -w /workspace ${containerImage} sh -c "${finalScript.replace(
        /"/g,
        '\\"'
      )}"`
    : finalScript;
  console.log(`Executing: ${command}`);

  exec(command, { timeout: 60000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) {
      console.error(`Execution error: ${error}`);
      res.status(500).json({ error: stderr || "Execution failed", stdout, stderr });
      return;
    }
    res.json({ result: stdout.trim(), stderr });
  });
};
