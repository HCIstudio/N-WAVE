import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Node, ReactFlowProvider } from "@xyflow/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { nodeDefinitions } from "../../../registry/nodeDefinitions";
import type { NodeData } from "../../nodes/BaseNode";
import MapPanel from "./MapPanel";

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
  return <MapPanel node={node} onSave={save} />;
};

const setup = (data: Partial<NodeData> = {}) => {
  const onSave = vi.fn<Save>();
  render(
    <ReactFlowProvider>
      <Panel initialNode={makeNode("map", data)} onSave={onSave} />
    </ReactFlowProvider>,
  );
  return { onSave, user: userEvent.setup() };
};

describe("MapPanel", () => {
  it("changes the case of lines by default", async () => {
    const { onSave, user } = setup();
    expect(screen.getByText("Operation: Map")).toBeTruthy();
    expect(screen.getByLabelText("Transformation")).toHaveProperty("value", "changeCase");
    expect(screen.queryByLabelText("Find")).toBeNull();

    await user.selectOptions(screen.getByLabelText("Case"), "Lowercase");
    expect(onSave).toHaveBeenLastCalledWith("node-map", {
      mapChangeCase: "toLowerCase",
    });
  });

  it("asks for find and replace text when replacing", async () => {
    const { onSave, user } = setup();
    await user.selectOptions(screen.getByLabelText("Transformation"), "Replace Text");
    expect(onSave).toHaveBeenLastCalledWith("node-map", {
      mapOperation: "replaceText",
    });
    expect(screen.queryByLabelText("Case")).toBeNull();

    await user.type(screen.getByLabelText("Find"), "a");
    expect(onSave).toHaveBeenLastCalledWith("node-map", { mapReplaceFind: "a" });
    await user.type(screen.getByLabelText("Replace With"), "b");
    expect(onSave).toHaveBeenLastCalledWith("node-map", { mapReplaceWith: "b" });
  });

  it("shows saved replace settings", () => {
    setup({ mapOperation: "replaceText", mapReplaceFind: "x", mapReplaceWith: "y" });
    expect(screen.getByLabelText("Find")).toHaveProperty("value", "x");
    expect(screen.getByLabelText("Replace With")).toHaveProperty("value", "y");
  });
});
