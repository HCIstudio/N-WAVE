import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type Node, ReactFlowProvider } from "@xyflow/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { nodeDefinitions } from "../../../registry/nodeDefinitions";
import type { FileObject, NodeData } from "../../nodes/BaseNode";
import FilterPanel from "./FilterPanel";

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

const Panel = ({ initialNode, onSave }: { initialNode: Node<NodeData>; onSave: Save }) => {
  const [node, setNode] = useState(initialNode);
  const save: Save = (nodeId, data) => {
    onSave(nodeId, data);
    setNode((current) => ({ ...current, data: { ...current.data, ...data } }));
  };
  return <FilterPanel node={node} onSave={save} />;
};

const reads: FileObject = { name: "reads.txt", content: "a\nb", size: 3 };
const notes: FileObject = { name: "notes.txt", content: "n", size: 1 };

/** A filter node, connected to a File Input node holding `files`. */
const setup = (files: FileObject[], data: Partial<NodeData> = {}) => {
  const onSave = vi.fn<Save>();
  const filter = makeNode("filter", data);
  const upload = { ...makeNode("fileInput", { files }), id: "upload" };
  render(
    <ReactFlowProvider
      initialNodes={[upload, filter]}
      initialEdges={[{ id: "e", source: "upload", target: filter.id }]}
    >
      <Panel initialNode={filter} onSave={onSave} />
    </ReactFlowProvider>,
  );
  return { onSave, user: userEvent.setup() };
};

describe("FilterPanel", () => {
  it("says when no files come in", () => {
    setup([]);
    expect(screen.getByText("Operation: Filter")).toBeTruthy();
    expect(screen.getByText("No files received from parent node.")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Select All" })).toBeNull();
  });

  it("selects incoming files one by one or all at once", async () => {
    const { onSave, user } = setup([reads, notes]);
    const selected = () =>
      last(onSave.mock.calls)?.[1].selectedFilterFiles?.map((f) => f.name);

    await user.click(screen.getByRole("checkbox", { name: "notes.txt" }));
    expect(selected()).toEqual(["notes.txt"]);
    expect(screen.getByRole("checkbox", { name: "notes.txt" })).toHaveProperty(
      "checked",
      true,
    );

    await user.click(screen.getByRole("checkbox", { name: "Select All" }));
    expect(selected()).toEqual(["reads.txt", "notes.txt"]);

    await user.click(screen.getByRole("checkbox", { name: "reads.txt" }));
    expect(selected()).toEqual(["notes.txt"]);

    await user.click(screen.getByRole("checkbox", { name: "Select All" }));
    await user.click(screen.getByRole("checkbox", { name: "Deselect All" }));
    expect(selected()).toEqual([]);
  });

  it("saves the filter settings", async () => {
    const { onSave, user } = setup([reads]);
    await user.type(screen.getByLabelText("Filter Text"), "ab");
    expect(onSave).toHaveBeenLastCalledWith("node-filter", { filterText: "ab" });

    await user.selectOptions(screen.getByLabelText("Filter Mode"), "Matches (Regex)");
    expect(onSave).toHaveBeenLastCalledWith("node-filter", {
      filterMode: "matches",
    });

    await user.click(screen.getByLabelText("Negate (exclude matches)"));
    expect(onSave).toHaveBeenLastCalledWith("node-filter", { filterNegate: true });
  });

  it("shows saved settings", () => {
    setup([reads], {
      filterText: "chr1",
      filterMode: "startsWith",
      filterNegate: true,
      selectedFilterFiles: [reads],
    });
    expect(screen.getByLabelText("Filter Text")).toHaveProperty("value", "chr1");
    expect(screen.getByLabelText("Filter Mode")).toHaveProperty("value", "startsWith");
    expect(screen.getByLabelText("Negate (exclude matches)")).toHaveProperty(
      "checked",
      true,
    );
    expect(screen.getByRole("checkbox", { name: "Deselect All" })).toHaveProperty(
      "checked",
      true,
    );
  });
});
