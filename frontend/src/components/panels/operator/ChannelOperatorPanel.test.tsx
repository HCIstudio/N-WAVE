import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Edge, Node } from "@xyflow/react";
import { type ContextType, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkflowContext } from "../../../context/WorkflowContext";
import { nodeDefinitions } from "../../../registry/nodeDefinitions";
import type { NodeData } from "../../nodes/BaseNode";
import ChannelOperatorPanel from "./ChannelOperatorPanel";

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

let canvasEdges: Edge[] = [];

/** The panel on a canvas whose node takes the saved data. */
const Canvas = ({
  initialNode,
  initialEdges,
  onSave,
}: {
  initialNode: Node<NodeData>;
  initialEdges: Edge[];
  onSave: Save;
}) => {
  const [node, setNode] = useState(initialNode);
  const [edges, setEdges] = useState(initialEdges);
  canvasEdges = edges;
  const save: Save = (nodeId, data) => {
    onSave(nodeId, data);
    setNode((current) => ({ ...current, data: { ...current.data, ...data } }));
  };
  const value = { nodes: [node], edges, setEdges } as ContextType<
    typeof WorkflowContext
  >;
  return (
    <WorkflowContext.Provider value={value}>
      <ChannelOperatorPanel node={node} onSave={save} />
    </WorkflowContext.Provider>
  );
};

const id = "node-channelOperator";

const setup = (data: Partial<NodeData> = {}, edges: Edge[] = []) => {
  const onSave = vi.fn<Save>();
  render(
    <Canvas
      initialNode={makeNode("channelOperator", data)}
      initialEdges={edges}
      onSave={onSave}
    />,
  );
  return { onSave, user: userEvent.setup() };
};

const problems = () =>
  screen
    .queryByRole("list", { name: "Channel operator problems" })
    ?.querySelectorAll("li");

const ports = (...names: string[]) =>
  names.map((name) => ({ name, label: name, isConnectable: true }));

describe("ChannelOperatorPanel", () => {
  it("shows the join template without problems", () => {
    setup();
    expect(screen.getByLabelText("Template")).toHaveProperty("value", "join");
    expect(screen.getByLabelText("Inputs (comma-separated)")).toHaveProperty(
      "value",
      "left, right",
    );
    expect(screen.getByLabelText("Outputs (comma-separated)")).toHaveProperty(
      "value",
      "joined",
    );
    expect(screen.getByLabelText("Channel code")).toHaveProperty(
      "value",
      "output.joined = input.left.join(input.right)",
    );
    expect(problems()).toBeUndefined();
  });

  it("applies a template and drops connections to ports it removes", async () => {
    const { onSave, user } = setup({}, [
      { id: "left", source: "a", target: id, targetHandle: "left" },
      { id: "out", source: id, sourceHandle: "joined", target: "b" },
      { id: "unrelated", source: "a", target: "b" },
    ]);
    await user.selectOptions(screen.getByLabelText("Template"), "branch");
    expect(onSave).toHaveBeenLastCalledWith(id, {
      inputs: ports("in"),
      outputs: ports("single", "paired"),
      channelOperatorCode: expect.stringContaining(
        "output.single = local.branched.single",
      ),
      channelOperatorTemplate: "branch",
      subtitle: "Branch",
    });
    expect(screen.getByLabelText("Inputs (comma-separated)")).toHaveProperty(
      "value",
      "in",
    );
    expect(screen.getByLabelText("Outputs (comma-separated)")).toHaveProperty(
      "value",
      "single, paired",
    );
    expect(canvasEdges.map((edge) => edge.id)).toEqual(["unrelated"]);
    expect(problems()).toBeUndefined();
  });

  it("saves ports typed as a list when the field loses focus", async () => {
    const { onSave, user } = setup({}, [
      { id: "right", source: "a", target: id, targetHandle: "right" },
      { id: "left", source: "a", target: id, targetHandle: "left" },
    ]);
    const inputs = screen.getByLabelText("Inputs (comma-separated)");
    await user.clear(inputs);
    await user.type(inputs, "left, , extra ");
    expect(onSave).not.toHaveBeenCalled();
    await user.tab();
    expect(onSave).toHaveBeenLastCalledWith(id, {
      inputs: ports("left", "extra"),
      outputs: ports("joined"),
    });
    expect(canvasEdges.map((edge) => edge.id)).toEqual(["left"]);
    expect(Array.from(problems() ?? []).map((item) => item.textContent)).toEqual([
      "Error: input.right isn't an input of this node.",
      "Warning: input.extra isn't used in the code.",
    ]);
  });

  it("requires an output", async () => {
    const { onSave, user } = setup();
    await user.clear(screen.getByLabelText("Outputs (comma-separated)"));
    await user.tab();
    expect(onSave).toHaveBeenLastCalledWith(id, {
      inputs: ports("left", "right"),
      outputs: [],
    });
    expect(Array.from(problems() ?? []).map((item) => item.textContent)).toEqual([
      "Error: Add at least one output.",
      "Error: output.joined isn't an output of this node.",
    ]);
  });

  it("saves edited code", async () => {
    const { onSave, user } = setup({ channelOperatorCode: "" });
    expect(screen.getByText("Error: output.joined is never assigned (write \"output.joined = ...\").")).toBeTruthy();
    await user.type(screen.getByLabelText("Channel code"), "x");
    expect(onSave).toHaveBeenLastCalledWith(id, { channelOperatorCode: "x" });
  });

  it("treats missing code and ports as empty", () => {
    setup({
      channelOperatorCode: undefined,
      channelOperatorTemplate: undefined,
      inputs: undefined,
      outputs: undefined,
    });
    expect(screen.getByLabelText("Template")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Channel code")).toHaveProperty("value", "");
    expect(screen.getByText("Error: Add at least one output.")).toBeTruthy();
  });
});
