import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Edge, Node } from "@xyflow/react";
import { type ContextType, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkflowContext } from "../../../context/WorkflowContext";
import type { WorkflowParameter } from "../../../registry/params";
import { nodeDefinitions } from "../../../registry/nodeDefinitions";
import type { NodeData } from "../../nodes/BaseNode";
import ParametersPanel, { summarizeParameters } from "./ParametersPanel";

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

let canvasEdges: Edge[] = [];

/** The panel on a canvas whose nodes take the saved data. */
const Canvas = ({
  initialNodes,
  initialEdges,
  onSave,
}: {
  initialNodes: Node<NodeData>[];
  initialEdges: Edge[];
  onSave: Save;
}) => {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  canvasEdges = edges;
  const save: Save = (nodeId, data) => {
    onSave(nodeId, data);
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node,
      ),
    );
  };
  const node = nodes.find((candidate) => candidate.id === "params");
  if (!node) throw new Error("No parameters node");
  const value = { nodes, edges, setEdges } as ContextType<
    typeof WorkflowContext
  >;
  return (
    <WorkflowContext.Provider value={value}>
      <ParametersPanel node={node} onSave={save} />
    </WorkflowContext.Provider>
  );
};

const setup = (
  parameters: WorkflowParameter[] = [],
  { others = [], edges = [] }: { others?: Node<NodeData>[]; edges?: Edge[] } = {},
) => {
  const onSave = vi.fn<Save>();
  const node = { ...makeNode("parameters", { parameters }), id: "params" };
  render(
    <Canvas initialNodes={[node, ...others]} initialEdges={edges} onSave={onSave} />,
  );
  return { onSave, user: userEvent.setup() };
};

const lastParameters = (onSave: ReturnType<typeof vi.fn<Save>>) =>
  last(onSave.mock.calls.filter(([, data]) => "parameters" in data))?.[1];

const lastSubtitle = (onSave: ReturnType<typeof vi.fn<Save>>) =>
  last(onSave.mock.calls.filter(([, data]) => "subtitle" in data))?.[1]
    .subtitle;

const genome: WorkflowParameter = { name: "genome", type: "file", value: "" };

describe("ParametersPanel", () => {
  it("starts with no parameters", () => {
    const { onSave } = setup();
    expect(screen.queryByRole("list", { name: "Parameters" })).toBeNull();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("adds parameters and reference files with free names", async () => {
    const other = {
      ...makeNode("parameters", {
        parameters: [{ name: "param_1", type: "text", value: "" }],
      }),
      id: "other",
    };
    const { onSave, user } = setup([], { others: [other] });

    await user.click(screen.getByRole("button", { name: "Add parameter" }));
    expect(lastParameters(onSave)).toEqual({
      parameters: [{ name: "param_2", type: "text", value: "" }],
      outputs: [],
    });
    expect(lastSubtitle(onSave)).toBe("1 parameter");

    await user.click(screen.getByRole("button", { name: "Add reference file" }));
    expect(lastParameters(onSave)?.outputs).toEqual([
      { name: "reference_1", label: "reference_1", isConnectable: true },
    ]);
    expect(lastSubtitle(onSave)).toBe("1 parameter, 1 reference");
    expect(
      screen.getByText(
        "Error: params.reference_1 needs a file: an uploaded file name, an absolute path or a URL.",
      ),
    ).toBeTruthy();
  });

  it("flags names declared twice or reserved by N-WAVE", () => {
    const other = {
      ...makeNode("parameters", {
        parameters: [{ name: "genome", type: "file", value: "/g.fa" }],
      }),
      id: "other",
    };
    setup(
      [
        { ...genome, value: "/g.fa" },
        { name: "outdir", type: "text", value: "" },
        { name: "1bad", type: "text", value: "" },
      ],
      { others: [other] },
    );
    expect(
      screen.getByText("Error: params.genome is declared more than once."),
    ).toBeTruthy();
    expect(
      screen.getByText("Error: params.outdir is used by N-WAVE; choose another name."),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Error: "1bad" isn\'t a valid name: use letters, digits and _, not starting with a digit.',
      ),
    ).toBeTruthy();
  });

  it("suggests uploaded files for references and warns about missing ones", async () => {
    const upload = {
      ...makeNode("fileInput", {
        files: [{ name: "genome.fa", content: ">chr1", size: 5 }],
      }),
      id: "upload",
    };
    const { onSave, user } = setup([genome], { others: [upload] });
    const value = screen.getByLabelText("File, path or URL");
    const list = document.getElementById(value.getAttribute("list") ?? "");
    expect(
      Array.from(list?.querySelectorAll("option") ?? []).map((o) => o.value),
    ).toEqual(["genome.fa"]);

    await user.type(value, "other.fa");
    expect(lastParameters(onSave)?.parameters).toEqual([
      { name: "genome", type: "file", value: "other.fa" },
    ]);
    expect(
      screen.getByText(
        'Warning: "other.fa" isn\'t uploaded; add it to a File Input node, or use an absolute path or URL.',
      ),
    ).toBeTruthy();

    await user.clear(value);
    await user.type(value, "genome.fa");
    expect(screen.queryByText(/Warning:/)).toBeNull();
    expect(screen.queryByText(/Error:/)).toBeNull();
  });

  it("drops connections from a renamed reference", async () => {
    const { onSave, user } = setup([{ ...genome, value: "/g.fa" }], {
      edges: [
        { id: "ref", source: "params", sourceHandle: "genome", target: "p" },
        { id: "other", source: "x", sourceHandle: "out", target: "p" },
      ],
    });
    const name = screen.getByLabelText("Name");
    await user.type(name, "2");
    expect(lastParameters(onSave)).toEqual({
      parameters: [{ name: "genome2", type: "file", value: "/g.fa" }],
      outputs: [{ name: "genome2", label: "genome2", isConnectable: true }],
    });
    expect(canvasEdges.map((edge) => edge.id)).toEqual(["other"]);
  });

  it("changes the type and clears the value", async () => {
    const { onSave, user } = setup([{ name: "threads", type: "text", value: "4" }]);
    await user.selectOptions(screen.getByLabelText("Type"), "Number");
    expect(lastParameters(onSave)?.parameters).toEqual([
      { name: "threads", type: "number", value: "" },
    ]);
    expect(screen.getByLabelText("Value")).toHaveProperty("type", "number");

    await user.selectOptions(screen.getByLabelText("Type"), "True/false");
    const checkbox = screen.getByRole("checkbox", { name: "Value of threads" });
    expect(checkbox).toHaveProperty("checked", false);
    await user.click(checkbox);
    expect(lastParameters(onSave)?.parameters).toEqual([
      { name: "threads", type: "boolean", value: "true" },
    ]);
    expect(checkbox).toHaveProperty("checked", true);
  });

  it("removes a parameter", async () => {
    const { onSave, user } = setup([
      { name: "a", type: "text", value: "" },
      { ...genome, value: "/g.fa" },
    ]);
    const rows = within(screen.getByRole("list", { name: "Parameters" }));
    expect(rows.getAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Remove a" }));
    expect(lastParameters(onSave)?.parameters).toEqual([
      { name: "genome", type: "file", value: "/g.fa" },
    ]);
    expect(lastSubtitle(onSave)).toBe("1 reference");
    expect(rows.getAllByRole("listitem")).toHaveLength(1);
  });
});

describe("summarizeParameters", () => {
  it("counts values and references", () => {
    expect(summarizeParameters([])).toBe("No parameters yet");
    expect(
      summarizeParameters([
        { name: "a", type: "text", value: "" },
        { name: "b", type: "boolean", value: "true" },
        { name: "c", type: "file", value: "" },
        { name: "d", type: "file", value: "" },
      ]),
    ).toBe("2 parameters, 2 references");
  });
});
