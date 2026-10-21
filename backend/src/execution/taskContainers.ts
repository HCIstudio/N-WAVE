import { readCommandOutput } from "./shell";

// Nextflow starts each task of a Docker run in a container of its own
// (named nxf-…). Stopping a run signals Nextflow, which asks Docker to stop
// them, but Docker gives a task 10 s before killing it, and nothing stops
// them if Nextflow itself has to be killed. So a stopped run removes its own
// task containers before it ends: those working inside its run folder.

/** Ids of the task containers working inside the run folder, from `docker inspect` lines. */
export const runTaskContainerIds = (inspectOutput: string, runDirName: string): string[] =>
  inspectOutput
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter(([id, workingDir]) => id && workingDir?.includes(`/${runDirName}/`))
    .map(([id]) => id as string);

/** Remove a run's task containers (none when Docker isn't there). */
export const removeRunTaskContainers = async (
  runDirName: string,
  run: (command: string) => Promise<string | undefined> = readCommandOutput,
): Promise<number> => {
  const ids = await run("docker ps -q --filter name=^nxf-");
  if (!ids) return 0;
  const inspected = await run(
    `docker inspect --format '{{.Id}} {{.Config.WorkingDir}}' ${ids.split(/\s+/).join(" ")}`,
  );
  const own = runTaskContainerIds(inspected ?? "", runDirName);
  if (own.length > 0) await run(`docker rm -f ${own.join(" ")}`);
  return own.length;
};
