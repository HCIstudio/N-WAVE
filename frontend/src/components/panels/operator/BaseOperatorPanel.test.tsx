import type { Node } from "@xyflow/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReactFlowProvider } from "@xyflow/react";
import { describe, expect, it, vi } from "vitest";
import { nodeDefinitions } from "../../../registry/nodeDefinitions";
import type { NodeData } from "../../nodes/BaseNode";
import BaseOperatorPanel, { type InjectedOperatorProps } from "./BaseOperatorPanel";

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

const Child = ({ nodeData, handleDataChange, incomingFiles, node }: InjectedOperatorProps) => (
  <div>
    <p>Label: {nodeData?.label}</p>
    <p>Node: {node?.id}</p>
    <p>Files: {incomingFiles?.map((file) => file.name).join(", ")}</p>
    <button type="button" onClick={() => handleDataChange?.("filterText", "x")}>
      Change
    </button>
  </div>
);

const setup = (files: NodeData["files"], showFileSelection?: boolean) => {
  const onSave = vi.fn<Save>();
  const filter = makeNode("filter");
  const upload = { ...makeNode("fileInput", { files }), id: "upload" };
  render(
    <ReactFlowProvider
      initialNodes={[upload, filter]}
      initialEdges={[{ id: "e", source: "upload", target: filter.id }]}
    >
      <BaseOperatorPanel
        node={filter}
        onSave={onSave}
        title="Custom"
        showFileSelection={showFileSelection}
      >
        <Child />
      </BaseOperatorPanel>
    </ReactFlowProvider>,
  );
  return { onSave, user: userEvent.setup() };
};

describe("BaseOperatorPanel", () => {
  it("gives its content the node, its data and the incoming files", async () => {
    const { onSave, user } = setup([
      { name: "b.txt", content: "b", size: 1 },
      { name: "a.txt", content: "a", size: 1 },
    ]);
    expect(screen.getByText("Operation: Custom")).toBeTruthy();
    expect(screen.getByText("Label: Filter")).toBeTruthy();
    expect(screen.getByText("Node: node-filter")).toBeTruthy();
    expect(screen.getByText("Files: b.txt, a.txt")).toBeTruthy();
    expect(screen.queryByText("File Selection")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(onSave).toHaveBeenCalledWith("node-filter", { filterText: "x" });
  });

  it("can summarise the incoming files", () => {
    setup([{ name: "a.txt", content: "a", size: 1 }], true);
    expect(screen.getByText("File Selection")).toBeTruthy();
    expect(
      screen.getByText("Processing 1 file(s) from parent node."),
    ).toBeTruthy();
  });

  it("says when no files come in", () => {
    setup([], true);
    expect(screen.getByText("No files received from parent node.")).toBeTruthy();
  });
});
