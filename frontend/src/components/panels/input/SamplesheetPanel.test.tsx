import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Node } from "@xyflow/react";
import { type ContextType, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkflowContext } from "../../../context/WorkflowContext";
import { nodeDefinitions } from "../../../registry/nodeDefinitions";
import type { NodeData } from "../../nodes/BaseNode";
import SamplesheetPanel, { summarizeSamplesheet } from "./SamplesheetPanel";

/** A canvas node created the way the "Add node" menu creates it. */
const makeNode = (
  definitionId: string,
  extra: Partial<NodeData> = {},
): Node<NodeData> => {
  const definition = nodeDefinitions.find((entry) => entry.id === definitionId);
  if (!definition) throw new Error(`No node definition ${definitionId}`);
  return {
    id: `node-${definitionId}`,
    type: definition.type,
    position: { x: 0, y: 0 },
    data: {
      label: definition.label,
      icon: definition.icon,
      ...definition.defaults,
      ...extra,
    },
  };
};

const last = <T,>(items: T[]): T | undefined => items[items.length - 1];

type Save = (nodeId: string, data: Partial<NodeData>) => void;

/** The panel on a canvas whose nodes take the saved data. */
const Canvas = ({
  initialNodes,
  onSave,
}: {
  initialNodes: Node<NodeData>[];
  onSave: Save;
}) => {
  const [nodes, setNodes] = useState(initialNodes);
  const save: Save = (nodeId, data) => {
    onSave(nodeId, data);
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node,
      ),
    );
  };
  const node = nodes.find((candidate) => candidate.type === "samplesheet");
  if (!node) throw new Error("No samplesheet node");
  const value = { nodes } as ContextType<typeof WorkflowContext>;
  return (
    <WorkflowContext.Provider value={value}>
      <SamplesheetPanel node={node} onSave={save} />
    </WorkflowContext.Provider>
  );
};

const setup = (data: Partial<NodeData> = {}, others: Node<NodeData>[] = []) => {
  const onSave = vi.fn<Save>();
  render(
    <Canvas
      initialNodes={[makeNode("samplesheet", data), ...others]}
      onSave={onSave}
    />,
  );
  return { onSave, user: userEvent.setup() };
};

const lastSubtitle = (onSave: ReturnType<typeof vi.fn<Save>>) =>
  last(onSave.mock.calls.filter(([, data]) => "subtitle" in data))?.[1]
    .subtitle;

const paired = [
  "sample,fastq_1,fastq_2,strandedness",
  "S1,/data/s1_1.fq.gz,/data/s1_2.fq.gz,auto",
  "S2,https://example.org/s2_1.fq.gz,https://example.org/s2_2.fq.gz,reverse",
].join("\n");

describe("SamplesheetPanel", () => {
  it("starts from the rnaseq header and says there are no samples", () => {
    const { onSave } = setup();
    expect(screen.getByLabelText("Samplesheet (CSV)")).toHaveProperty(
      "value",
      "sample,fastq_1,fastq_2,strandedness\n",
    );
    expect(screen.getByLabelText("File name in inputs/")).toHaveProperty(
      "value",
      "samplesheet.csv",
    );
    expect(
      screen.getByText("Warning: The samplesheet has no samples yet."),
    ).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("previews the samples of a pasted samplesheet", async () => {
    const { onSave, user } = setup();
    const csv = screen.getByLabelText("Samplesheet (CSV)");
    await user.clear(csv);
    await user.click(csv);
    await user.paste(paired);

    expect(onSave).toHaveBeenLastCalledWith("node-samplesheet", {
      subtitle: "2 samples, paired-end",
    });
    const table = screen.getByRole("table", { name: "Parsed samples" });
    const rows = within(table).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      "meta.idReadsLayoutmeta.strandedness",
      "S1/data/s1_1.fq.gz(local runs)/data/s1_2.fq.gz(local runs)paired-endauto",
      "S2https://example.org/s2_1.fq.gz(local runs)https://example.org/s2_2.fq.gz(local runs)paired-endreverse",
    ]);
    expect(screen.queryByRole("list", { name: "Samplesheet problems" })).toBeNull();
  });

  it("checks read files against uploaded files", () => {
    const upload = {
      ...makeNode("fileInput", {
        files: [{ name: "s1.fq.gz", content: "@r", size: 2 }],
      }),
      id: "upload",
    };
    const { onSave } = setup(
      {
        samplesheet: "sample,fastq_1,fastq_2\nS1,s1.fq.gz,\nS2,s2.fq.gz,",
      },
      [upload],
    );
    const problems = screen.getByRole("list", { name: "Samplesheet problems" });
    expect(problems.textContent).toBe(
      'Error: "s2.fq.gz" (line 3) isn\'t uploaded. Add it to a File Input node, or use an absolute path or URL.',
    );
    expect(lastSubtitle(onSave)).toBe("1 problem to fix");
    // The uploaded read has no "(local runs)" note.
    expect(screen.getByText("s1.fq.gz").textContent).toBe("s1.fq.gz");
  });

  it("summarises single-end and mixed samplesheets", () => {
    const { onSave } = setup({
      samplesheet: "sample,fastq_1,fastq_2\nA,/a.fq,\nB,/b_1.fq,/b_2.fq",
    });
    expect(lastSubtitle(onSave)).toBe("2 samples, 1 paired-end");
    expect(
      screen.getByText(
        "Warning: The samplesheet mixes single-end and paired-end samples.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("single-end")).toBeTruthy();
  });

  it("maps columns chosen in the selects", async () => {
    const { onSave, user } = setup({
      samplesheet: "id,r1\nA,/a.fq",
    });
    expect(lastSubtitle(onSave)).toBe("3 problems to fix");

    await user.selectOptions(screen.getByLabelText("Sample id column"), "id");
    await user.selectOptions(screen.getByLabelText("Read 1 column"), "r1");
    await user.selectOptions(
      screen.getByLabelText("Read 2 column"),
      "None (single-end)",
    );
    expect(onSave).toHaveBeenCalledWith("node-samplesheet", {
      samplesheetMapping: { idColumn: "id", read1Column: "r1", read2Column: "" },
    });
    expect(lastSubtitle(onSave)).toBe("1 sample, single-end");
  });

  it("reports every problem with the header", () => {
    setup({ samplesheet: "" });
    expect(screen.getByText("Error: The samplesheet is empty.")).toBeTruthy();
  });

  it("renames the CSV file", async () => {
    const { onSave, user } = setup();
    const name = screen.getByLabelText("File name in inputs/");
    await user.clear(name);
    await user.type(name, "runs.csv");
    expect(onSave).toHaveBeenLastCalledWith("node-samplesheet", {
      samplesheetFileName: "runs.csv",
    });
    expect(name).toHaveProperty("value", "runs.csv");
  });

  it("resets to the rnaseq template", async () => {
    const { onSave, user } = setup({
      samplesheet: "id\nA",
      samplesheetMapping: { idColumn: "id", read1Column: "r", read2Column: "" },
    });
    await user.click(screen.getByRole("button", { name: "rnaseq template" }));
    expect(onSave).toHaveBeenCalledWith("node-samplesheet", {
      samplesheet: "sample,fastq_1,fastq_2,strandedness\n",
      samplesheetMapping: {
        idColumn: "sample",
        read1Column: "fastq_1",
        read2Column: "fastq_2",
      },
    });
  });

  it("loads a CSV file and keeps its name when it is a valid file name", async () => {
    const { onSave, user } = setup();
    const input = screen.getByLabelText<HTMLInputElement>(
      "Samplesheet CSV file",
    );
    const click = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Load CSV" }));
    expect(click).toHaveBeenCalled();

    await user.upload(
      input,
      new File([paired], "my_runs.csv", { type: "text/csv" }),
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("node-samplesheet", {
        samplesheet: paired,
        samplesheetFileName: "my_runs.csv",
      }),
    );
    // The input is cleared so the same file can be loaded again.
    expect(input.value).toBe("");

    await user.upload(
      input,
      new File(["sample,fastq_1\n"], "my runs (1).csv", { type: "text/csv" }),
    );
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith("node-samplesheet", {
        samplesheet: "sample,fastq_1\n",
        samplesheetFileName: "my_runs.csv",
      }),
    );
  });
});

describe("summarizeSamplesheet", () => {
  it("counts problems, samples and layouts", () => {
    const row = (singleEnd: boolean) => ({
      line: 2,
      id: "A",
      reads: [],
      singleEnd,
      meta: {},
    });
    expect(
      summarizeSamplesheet({
        columns: [],
        rows: [],
        issues: [{ level: "error", message: "a" }, { level: "warning", message: "b" }],
      }),
    ).toBe("1 problem to fix");
    expect(summarizeSamplesheet({ columns: [], rows: [], issues: [] })).toBe(
      "No samples yet",
    );
    expect(
      summarizeSamplesheet({ columns: [], rows: [row(true), row(true)], issues: [] }),
    ).toBe("2 samples, single-end");
  });
});
