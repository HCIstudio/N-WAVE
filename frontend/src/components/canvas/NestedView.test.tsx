import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RunTask } from "../../api/runs";

const get = vi.fn();
vi.mock("../../api", () => ({
  default: { get: (...args: unknown[]) => get(...args), post: vi.fn(async () => ({ data: {} })) },
  isDemoMode: false,
}));
const moduleSource = vi.fn();
vi.mock("../../api/nfcore", () => ({ getNfCoreModuleSource: (id: string) => moduleSource(id) }));

const { default: NestedView } = await import("./NestedView");
const { forgetLoadedWorkflows } = await import("../../workflows/nested/loadWorkflow");
const { CopySubworkflowContext } = await import("../../workflows/copySubworkflowWorkflow");

const fixture = (name: string) => readFileSync(join(__dirname, "../../test/fixtures/nested", name), "utf8");

beforeAll(() => {
  // React Flow measures its pane and nodes.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const task = (process: string, status: RunTask["status"] = "succeeded"): RunTask => ({
  hash: process,
  name: process,
  process,
  status,
});

const pipelineEntry = { source: { type: "pipeline", name: "rnaseq", version: "3.27.0", path: "main.nf" } } as const;

describe("NestedView", () => {
  beforeEach(() => {
    forgetLoadedWorkflows();
    get.mockReset();
    moduleSource.mockReset();
    get.mockImplementation(async (url: string) => {
      const path = new URLSearchParams(url.split("?")[1]).get("path");
      if (path === "main.nf") return { data: { source: fixture("rnaseq-main.nf") } };
      if (path === "workflows/rnaseq/main.nf") return { data: { source: fixture("rnaseq-workflow.nf") } };
      throw Object.assign(new Error("Not found"), { response: { status: 404, data: { message: `no ${path}` } } });
    });
  });
  afterEach(() => vi.clearAllMocks());

  it("shows a pipeline's steps with what the run did, and goes in and back out", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <NestedView
        title="nf-core/rnaseq"
        entry={pipelineEntry}
        workflowName="Demo 2"
        tasks={[
          task("NFCORE_RNASEQ:PREPARE_GENOME_REFERENCES:GUNZIP_FASTA"),
          task("NFCORE_RNASEQ:RNASEQ:ALIGN_STAR:STAR_ALIGN", "running"),
        ]}
        isRunning
        onClose={onClose}
      />,
    );
    expect(screen.getByText("Reading the steps inside…")).toBeTruthy();
    const references = await screen.findByRole("button", { name: /PREPARE_GENOME_REFERENCES/ });
    expect(references.textContent).toContain("Done");
    expect(screen.getByRole("button", { name: /PREPARE_GENOME_INDICES/ }).textContent).toContain("Waiting");
    expect(get).toHaveBeenCalledWith("/pipelines/workflow-file?name=rnaseq&version=3.27.0&path=main.nf");

    // A click only: d3-zoom can't handle jsdom's pointer events on the graph.
    fireEvent.click(screen.getByRole("button", { name: /^RNASEQ/ }));
    const align = await screen.findByRole("button", { name: /^ALIGN_STAR/ });
    expect(align.textContent).toContain("Running");
    const crumbs = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumbs.getByText("RNASEQ").getAttribute("aria-current")).toBe("page");

    // Back to the pipeline's top, then out.
    await user.click(crumbs.getByRole("button", { name: "nf-core/rnaseq" }));
    expect(await screen.findByRole("button", { name: /PREPARE_GENOME_INDICES/ })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an nf-core subworkflow's steps, its tasks named after its alias", async () => {
    moduleSource.mockResolvedValue(fixture("quantify_pseudo_alignment.nf"));
    render(
      <NestedView
        title="Quantify"
        entry={{ source: { type: "nfcore", id: "nf-core/subworkflows/quantify_pseudo_alignment" }, path: ["QUANT_1"] }}
        workflowName="Mine"
        tasks={[task("QUANT_1:SALMON_QUANT", "failed")]}
        isRunning={false}
        onClose={vi.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("SALMON_QUANT")).toBeTruthy());
    expect(moduleSource).toHaveBeenCalledWith("nf-core/subworkflows/quantify_pseudo_alignment");
    const salmon = screen.getByText("SALMON_QUANT").closest("[data-status]");
    expect(salmon?.getAttribute("data-status")).toBe("failed");
    // Processes don't open; the subworkflow inside does.
    expect(screen.queryByRole("button", { name: /^SALMON_QUANT/ })).toBeNull();
    expect(screen.getByRole("button", { name: /QUANT_TXIMPORT_SUMMARIZEDEXPERIMENT/ })).toBeTruthy();
  });

  it("says when the steps can't be read, and tries again", async () => {
    get.mockRejectedValueOnce({ response: { status: 502, data: { message: "GitHub is down" } } });
    const user = userEvent.setup();
    render(<NestedView title="x" entry={pipelineEntry} workflowName="W" tasks={[]} isRunning={false} onClose={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toContain("GitHub is down");
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /^RNASEQ/ })).toBeTruthy();
  });

  it("copies the nf-core subworkflow it shows into a new workflow, where that's offered", async () => {
    moduleSource.mockResolvedValue(fixture("quantify_pseudo_alignment.nf"));
    const copy = vi.fn(async () => {});
    const user = userEvent.setup();
    const entry = { source: { type: "nfcore" as const, id: "nf-core/subworkflows/quantify_pseudo_alignment" }, path: ["Q"] };
    const { unmount } = render(
      <CopySubworkflowContext.Provider value={copy}>
        <NestedView title="Quantify" entry={entry} workflowName="Mine" tasks={[]} isRunning={false} onClose={vi.fn()} />
      </CopySubworkflowContext.Provider>,
    );
    await user.click(screen.getByRole("button", { name: "Copy into new workflow" }));
    expect(copy).toHaveBeenCalledWith("nf-core/subworkflows/quantify_pseudo_alignment");
    unmount();

    // Not for a pipeline's files, nor without the page offering it.
    render(
      <CopySubworkflowContext.Provider value={copy}>
        <NestedView title="x" entry={pipelineEntry} workflowName="W" tasks={[]} isRunning={false} onClose={vi.fn()} />
      </CopySubworkflowContext.Provider>,
    );
    expect(screen.queryByRole("button", { name: "Copy into new workflow" })).toBeNull();
  });
});
