import type { Edge, Node } from "@xyflow/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import demo3 from "../../../demo/recordedRuns/demo-3.json";
import rnaseq from "../../../demo/rnaseqStarSalmonExample.json";

vi.mock("../../../api/runs", () => ({
  getRunTrace: async () => demo3.trace,
  getRunLog: async () => demo3.log,
}));
const { default: RunBottlenecks, formatSeconds, readRunResources } = await import("./RunBottlenecks");

describe("RunBottlenecks", () => {
  it("reads the run's limits from its log", () => {
    expect(readRunResources("N-WAVE run: x\nN-WAVE limits: 4 CPUs, 4 GB memory, time limit 1440 min\n")).toEqual({
      cpus: 4,
      memory: 4 * 1024 ** 3,
    });
    expect(readRunResources("nothing")).toBeNull();
    expect(formatSeconds(19.37)).toBe("19.4 s");
    expect(formatSeconds(218.6)).toBe("3 min 39 s");
  });

  it("shows Demo 3's predicted and measured runtime, what limited each step, and the chain on the canvas", async () => {
    const onShowChain = vi.fn();
    render(<RunBottlenecks runId="r3" nodes={rnaseq.nodes as Node[]} edges={rnaseq.edges as Edge[]} onShowChain={onShowChain} />);
    expect((await screen.findByTestId("bottleneck-prediction")).textContent).toBe(
      "Predicted 3 min 30 s, measured 3 min 39 s (4 % less). An estimate fitted to this run, with its 4 CPUs and 4 GB of memory.",
    );
    const steps = screen.getByRole("list", { name: "What limited each step" });
    expect(steps.textContent).toContain("STAR alignment: limited by waiting for STAR index");
    expect(screen.getByTestId("bottleneck-chain").textContent).toBe(
      "The chain that set the runtime: Unzip GTF → Filter GTF → STAR index → STAR alignment → SAMtools sort, index, stats → MultiQC.",
    );
    await userEvent.click(screen.getByRole("button", { name: "Show the chain on the canvas" }));
    expect(onShowChain).toHaveBeenCalledWith(["gunzip_gtf", "gtf_filter", "star_index", "star_align", "bam_sort_stats", "multiqc"]);
    expect(screen.getAllByRole("link", { name: "ICPE '25" })[0]?.getAttribute("href")).toBe("https://doi.org/10.1145/3676151.3719382");
  });
});
