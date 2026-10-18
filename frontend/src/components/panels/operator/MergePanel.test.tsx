import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Edge, type Node, ReactFlowProvider } from "@xyflow/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { nodeDefinitions } from "../../../registry/nodeDefinitions";
import type { NodeData } from "../../nodes/BaseNode";
import MergePanel from "./MergePanel";

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

type Save = (nodeId: string, data: Partial<NodeData>) => void;

const Panel = ({ initialNode, onSave }: { initialNode: Node<NodeData>; onSave: Save }) => {
  const [node, setNode] = useState(initialNode);
  const save: Save = (nodeId, data) => {
    onSave(nodeId, data);
    setNode((current) => ({ ...current, data: { ...current.data, ...data } }));
  };
  return <MergePanel node={node} onSave={save} />;
};

const setup = (
  data: Partial<NodeData> = {},
  upstream: Node<NodeData>[] = [],
  edges: Edge[] = [],
) => {
  const onSave = vi.fn<Save>();
  const merge = makeNode("merge", data);
  render(
    <ReactFlowProvider initialNodes={[...upstream, merge]} initialEdges={edges}>
      <Panel initialNode={merge} onSave={onSave} />
    </ReactFlowProvider>,
  );
  return { onSave, user: userEvent.setup() };
};

const upload = (id: string, names: string[]) => ({
  ...makeNode("fileInput", {
    files: names.map((name) => ({ name, content: "x", size: 1 })),
  }),
  id,
});

const optionsOf = (label: string) =>
  Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map(
    (option) => option.value,
  );

describe("MergePanel", () => {
  it("joins into a txt file without upstream files", () => {
    const { onSave } = setup();
    expect(screen.getByText("Operation: Merge")).toBeTruthy();
    expect(screen.getByLabelText("Separator")).toHaveProperty("value", "\\n");
    expect(optionsOf("Output Type")).toEqual(["txt"]);
    expect(onSave).toHaveBeenCalledWith("node-merge", { joinType: "txt" });
  });

  it("offers the file types that come in", async () => {
    const { onSave, user } = setup(
      { joinType: "txt" },
      [upload("a", ["one.CSV", "two.tsv"]), upload("b", ["three.csv"]), upload("c", ["x.bed"])],
      [
        { id: "e1", source: "a", target: "node-merge" },
        { id: "e2", source: "b", target: "node-merge" },
        // Edges from missing nodes or into other nodes don't count.
        { id: "e3", source: "gone", target: "node-merge" },
        { id: "e4", source: "c", target: "elsewhere" },
      ],
    );
    expect(optionsOf("Output Type")).toEqual(["csv", "tsv"]);
    expect(screen.getByLabelText("Output Type")).toHaveProperty("value", "csv");
    expect(onSave).toHaveBeenLastCalledWith("node-merge", { joinType: "csv" });

    await user.selectOptions(screen.getByLabelText("Output Type"), "tsv");
    expect(onSave).toHaveBeenLastCalledWith("node-merge", { joinType: "tsv" });
  });

  it("keeps a saved type that still comes in", () => {
    const { onSave } = setup(
      { joinType: "tsv" },
      [upload("a", ["one.csv", "two.tsv"])],
      [{ id: "e1", source: "a", target: "node-merge" }],
    );
    expect(screen.getByLabelText("Output Type")).toHaveProperty("value", "tsv");
    expect(onSave).not.toHaveBeenCalledWith("node-merge", { joinType: "csv" });
  });

  it("saves the separator", async () => {
    const { onSave, user } = setup();
    const separator = screen.getByLabelText("Separator");
    await user.clear(separator);
    await user.type(separator, ",");
    expect(onSave).toHaveBeenLastCalledWith("node-merge", {
      mergeJoinSeparator: ",",
    });
  });

  it("hides the join settings for other merge operations", () => {
    setup({ mergeOperation: "collect" });
    expect(screen.queryByLabelText("Separator")).toBeNull();
    expect(screen.queryByLabelText("Output Type")).toBeNull();
  });
});
