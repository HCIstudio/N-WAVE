import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkWorkFolders, foldersOfTasks, openedPaths } from "./workFolders";

const PREFIX = "/srv/nwave/results/run_0";

/** A line of the monitor's access log (columns as file-bpf.csv has them). */
const line = (type: string, recorded: string) => `1.000,1.001,100,0.1,0.1,0.1,0.1,7,${type},0,3,0,0,0x00008001,${recorded}:/srv:`;

describe("the check of the steps' work folders", () => {
  let runDir: string;
  beforeEach(() => {
    runDir = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-workfolders-"));
  });
  afterEach(() => fs.rmSync(runDir, { recursive: true, force: true }));

  const make = (relative: string, content = "x") => {
    const file = path.join(runDir, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };

  it("reads the opens under the run's folder, also of paths with commas, and nothing else", () => {
    const log = [
      "time_start,time_end,pid,utime_start,utime_end,stime_start,stime_end,inode,type,result,handle,offset,size,flags,path",
      line("O", `${PREFIX}/nextflow/work/ab/cdef01/out,1.txt`),
      line("R", `${PREFIX}/nextflow/work/ab/cdef01/read-only`),
      line("O", "/etc/passwd"),
    ].join("\n");
    expect([...openedPaths(log, PREFIX)]).toEqual(["nextflow/work/ab/cdef01/out,1.txt"]);
  });

  it("counts, per task, the files in its work folder the monitor has no open of", () => {
    make("nextflow/work/ab/cdef0123/.command.sh");
    make("nextflow/work/ab/cdef0123/.command.begin", "");
    make("nextflow/work/ab/cdef0123/sub/part.txt");
    make("nextflow/work/9f/0011aa/.command.sh");
    // A staged input is a link: no file is made for it.
    make("inputs/reads.fq");
    fs.symlinkSync(path.join(runDir, "inputs/reads.fq"), path.join(runDir, "nextflow/work/9f/0011aa/reads.fq"));
    const opened = new Set([
      "nextflow/work/ab/cdef0123/.command.sh",
      "nextflow/work/ab/cdef0123/sub/part.txt",
      "nextflow/work/9f/0011aa/.command.sh",
    ]);
    const check = checkWorkFolders(runDir, opened, 0);
    expect(check).toEqual({
      files: 4,
      missed: 1,
      folders: [
        { folder: "9f/0011aa", files: 1, missed: 0, missedFiles: [] },
        { folder: "ab/cdef0123", files: 3, missed: 1, missedFiles: [".command.begin"] },
      ],
    });
    expect(foldersOfTasks(check.folders, ["ab/cdef01"]).map((folder) => folder.folder)).toEqual(["ab/cdef0123"]);
  });

  it("leaves out files from before the monitor started (a resumed run's cached tasks)", () => {
    make("nextflow/work/ab/cdef0123/.command.sh");
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(runDir, "nextflow/work/ab/cdef0123/.command.sh"), old, old);
    expect(checkWorkFolders(runDir, new Set(), Date.now() - 1000)).toEqual({ files: 0, missed: 0, folders: [] });
  });

  it("has nothing to check without work folders (the run cache was cleared)", () => {
    expect(checkWorkFolders(runDir, new Set(), 0)).toEqual({ files: 0, missed: 0, folders: [] });
  });
});
