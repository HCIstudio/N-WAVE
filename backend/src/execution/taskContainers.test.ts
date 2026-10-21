import { describe, expect, it } from "vitest";
import { removeRunTaskContainers, runTaskContainerIds } from "./taskContainers";

const inspect = [
  "aaa /app/results/sleepy_3/nextflow/work/34/9a67a9",
  "bbb /app/results/sleepy_30/nextflow/work/12/34ab",
  "ccc /home/u/results/sleepy_3/nextflow/work/56/78cd",
  "ddd /",
].join("\n");

describe("a stopped run's task containers", () => {
  it("are those working inside its run folder", () => {
    expect(runTaskContainerIds(inspect, "sleepy_3")).toEqual(["aaa", "ccc"]);
    expect(runTaskContainerIds("", "sleepy_3")).toEqual([]);
  });

  it("are removed, and nothing is run when there are none", async () => {
    const commands: string[] = [];
    const run = async (command: string) => {
      commands.push(command);
      if (command.startsWith("docker ps")) return "aaa\nbbb\nccc";
      if (command.startsWith("docker inspect")) return inspect;
      return "";
    };
    expect(await removeRunTaskContainers("sleepy_3", run)).toBe(2);
    expect(commands).toEqual([
      "docker ps -q --filter name=^nxf-",
      "docker inspect --format '{{.Id}} {{.Config.WorkingDir}}' aaa bbb ccc",
      "docker rm -f aaa ccc",
    ]);

    const none: string[] = [];
    expect(
      await removeRunTaskContainers("sleepy_3", async (command) => {
        none.push(command);
        return undefined;
      }),
    ).toBe(0);
    expect(none).toEqual(["docker ps -q --filter name=^nxf-"]);
  });
});
