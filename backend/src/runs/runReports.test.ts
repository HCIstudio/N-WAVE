import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildReportsConfig,
  findRunReports,
  parseTrace,
  parseTraceBytes,
  parseTraceDuration,
} from "./runReports";

// Written by Nextflow 25.04 with buildReportsConfig's trace settings (raw).
const RAW_TRACE = [
  "task_id\thash\tname\tprocess\ttag\tstatus\texit\tattempt\tsubmit\tstart\tcomplete\tduration\trealtime\t%cpu\tpeak_rss\tcpus\tmemory\ttime",
  "1\t89/2627b9\tSLOW (a)\tSLOW\ta\tCACHED\t0\t1\t1793192407519\t1793192407616\t1793192409647\t2128\t2012\t1.5\t5033984\t1\t-\t-",
  "2\t4e/c82d68\tBAD (1)\tBAD\t-\tFAILED\t3\t1\t1793192415201\t1793192415211\t1793192415263\t62\t52\t-\t-\t1\t-\t-",
].join("\n");

// The default fields and formatting, as nf-core pipelines write them.
const NFCORE_TRACE = [
  "task_id\thash\tnative_id\tname\tstatus\texit\tsubmit\tduration\trealtime\t%cpu\tpeak_rss\tpeak_vmem\trchar\twchar",
  "4\tab/123456\t1234\tNFCORE_X:FASTQC (s1)\tCOMPLETED\t0\t2026-10-27 10:50:20.123\t1m 4s\t58.2s\t95.4%\t1.2 GB\t2 GB\t1 MB\t2 MB",
].join("\n");

describe("run reports", () => {
  it("turns the report, timeline and trace on for the run's own folder", () => {
    const config = buildReportsConfig("bee_1");
    expect(config).toContain("report {\n  enabled = true\n  file = 'nwave_reports/bee_1/execution_report.html'\n  overwrite = true\n}");
    expect(config).toContain("file = 'nwave_reports/bee_1/execution_timeline.html'");
    expect(config).toContain("file = 'nwave_reports/bee_1/execution_trace.txt'");
    expect(config).toContain("raw = true");
    expect(config).toMatch(/fields = '.*peak_rss.*memory/);
  });

  it("reads a raw trace", () => {
    expect(parseTrace(RAW_TRACE)).toEqual([
      {
        hash: "89/2627b9",
        name: "SLOW (a)",
        process: "SLOW",
        status: "CACHED",
        exit: 0,
        attempt: 1,
        submit: 1793192407519,
        start: 1793192407616,
        complete: 1793192409647,
        duration: 2128,
        realtime: 2012,
        cpu: 1.5,
        peakRss: 5033984,
        cpus: 1,
        memory: null,
      },
      expect.objectContaining({ name: "BAD (1)", status: "FAILED", exit: 3, cpu: null, peakRss: null }),
    ]);
  });

  it("reads a trace as nf-core pipelines write it", () => {
    const [task] = parseTrace(NFCORE_TRACE);
    expect(task).toMatchObject({
      process: "NFCORE_X:FASTQC",
      attempt: 1,
      duration: 64_000,
      realtime: 58_200,
      cpu: 95.4,
      peakRss: Math.round(1.2 * 1024 ** 3),
    });
    expect(task?.submit).toBe(Date.parse("2026-10-27T10:50:20.123"));
    expect(parseTraceDuration("1h 2m 3s")).toBe(3_723_000);
    expect(parseTraceDuration("450ms")).toBe(450);
    expect(parseTraceDuration("-")).toBeNull();
    expect(parseTraceBytes("512 MB")).toBe(512 * 1024 ** 2);
    expect(parseTraceBytes("lots")).toBeNull();
    expect(parseTrace("")).toEqual([]);
  });

  describe("finding them", () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "nwave-reports-"));
    });
    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    it("finds the run's own reports, or what an nf-core pipeline wrote itself", () => {
      const own = path.join(dir, "nwave_reports", "run_2");
      fs.mkdirSync(own, { recursive: true });
      fs.writeFileSync(path.join(own, "execution_report.html"), "<html>");
      const info = path.join(dir, "results", "pipeline_info");
      fs.mkdirSync(info, { recursive: true });
      fs.writeFileSync(path.join(info, "execution_timeline_2026-10-27_10-00-00.html"), "<html>");
      fs.writeFileSync(path.join(info, "execution_trace_2026-10-27_10-00-00.txt"), NFCORE_TRACE);
      expect(findRunReports(dir, "run_2")).toEqual({
        report: path.join(own, "execution_report.html"),
        timeline: path.join(info, "execution_timeline_2026-10-27_10-00-00.html"),
        trace: path.join(info, "execution_trace_2026-10-27_10-00-00.txt"),
      });
      expect(findRunReports(path.join(dir, "missing"), "run_2")).toEqual({});
    });
  });
});
