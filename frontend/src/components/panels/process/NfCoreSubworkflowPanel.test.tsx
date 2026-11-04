import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Node } from "@xyflow/react";
import type { ContextType } from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkflowContext } from "../../../context/WorkflowContext";
import { CopySubworkflowContext } from "../../../workflows/copySubworkflowWorkflow";
import type { NodeData } from "../../nodes/BaseNode";
import NfCoreSubworkflowPanel from "./NfCoreSubworkflowPanel";

const node: Node<NodeData> = {
  id: "sub",
  type: "process",
  position: { x: 0, y: 0 },
  data: { label: "BAM sort", nwaveNfCoreModuleId: "nf-core/subworkflows/bam_sort_stats_samtools", nfcoreSubworkflowTakes: [] },
};

const renderPanel = (copy: ((id: string) => Promise<void>) | null) =>
  render(
    <WorkflowContext.Provider value={{ nodes: [node], edges: [], setEdges: vi.fn() } as unknown as ContextType<typeof WorkflowContext>}>
      <CopySubworkflowContext.Provider value={copy}>
        <NfCoreSubworkflowPanel node={node} onSave={vi.fn()} />
      </CopySubworkflowContext.Provider>
    </WorkflowContext.Provider>,
  );

describe("NfCoreSubworkflowPanel", () => {
  it("copies the subworkflow into a new workflow, and says the node stays as it is", async () => {
    let finish = () => {};
    const copy = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    renderPanel(copy);
    expect(screen.getByText(/This node stays as it is/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Copy into new workflow" }));
    expect(copy).toHaveBeenCalledWith("nf-core/subworkflows/bam_sort_stats_samtools");
    expect((screen.getByRole("button", { name: "Copying…" }) as HTMLButtonElement).disabled).toBe(true);
    finish();
    expect(await screen.findByRole("button", { name: "Copy into new workflow" })).toBeTruthy();
  });

  it("doesn't offer copying where the page doesn't", () => {
    renderPanel(null);
    expect(screen.queryByRole("button", { name: "Copy into new workflow" })).toBeNull();
  });
});
