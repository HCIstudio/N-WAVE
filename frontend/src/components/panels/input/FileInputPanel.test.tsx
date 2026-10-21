import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Node } from "@xyflow/react";
import { type ContextType, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { WorkflowContext } from "../../../context/WorkflowContext";
import { nodeDefinitions } from "../../../registry/nodeDefinitions";
import type { FileObject, NodeData } from "../../nodes/BaseNode";
import FileInputPanel from "./FileInputPanel";

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

/** The panel on a canvas whose node takes the data the panel saves. */
const Canvas = ({
  initialNode,
  updateNodeData,
}: {
  initialNode: Node<NodeData>;
  updateNodeData: Save;
}) => {
  const [node, setNode] = useState(initialNode);
  const save: Save = (nodeId, data) => {
    updateNodeData(nodeId, data);
    setNode((current) => ({ ...current, data: { ...current.data, ...data } }));
  };
  const value = { nodes: [node], updateNodeData: save } as ContextType<
    typeof WorkflowContext
  >;
  return (
    <WorkflowContext.Provider value={value}>
      <FileInputPanel node={node} onSave={() => {}} />
    </WorkflowContext.Provider>
  );
};

const file = (name: string, content: string, fileType?: string): FileObject => ({
  name,
  content,
  size: content.length,
  ...(fileType ? { fileType } : {}),
});

const setup = (files: FileObject[]) => {
  const updateNodeData = vi.fn<Save>();
  const view = render(
    <Canvas
      initialNode={makeNode("fileInput", { files })}
      updateNodeData={updateNodeData}
    />,
  );
  return { updateNodeData, view, user: userEvent.setup() };
};

const fileInput = (container: HTMLElement) => {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  if (!input) throw new Error("No file input");
  return input;
};

const shownFiles = () =>
  screen.queryAllByRole("button", { name: /^Remove / }).map((button) =>
    button.getAttribute("aria-label")?.replace("Remove ", ""),
  );

describe("FileInputPanel", () => {
  it("explains how to add files when there are none", () => {
    setup([]);
    expect(screen.getByText("Workflow Input Files (0)")).toBeTruthy();
    expect(screen.getByText("No files have been added.")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Search files...")).toBeNull();
  });

  // A node fresh from the Add-node menu has no files list yet.
  it("opens for a new node without a files list", () => {
    render(
      <Canvas initialNode={makeNode("fileInput")} updateNodeData={vi.fn()} />,
    );
    expect(screen.getByText("No files have been added.")).toBeTruthy();
  });

  it("lists files with their size and type", () => {
    setup([file("reads.fastq", "x".repeat(2048), "fastq"), file("empty.txt", "")]);
    expect(screen.getByText("Workflow Input Files (2)")).toBeTruthy();
    expect(screen.getByText("2 KB")).toBeTruthy();
    expect(screen.getByText("0 B")).toBeTruthy();
    expect(screen.getByText("fastq")).toBeTruthy();
  });

  it("uploads files and summarises them on the node", async () => {
    const { updateNodeData, view, user } = setup([]);
    await user.upload(fileInput(view.container), [
      new File(["ACGT"], "a.fa"),
      new File(["@r\nACGT"], "b.fastq"),
    ]);
    await waitFor(() => expect(updateNodeData).toHaveBeenCalled());
    expect(updateNodeData).toHaveBeenCalledWith("node-fileInput", {
      files: [
        { name: "a.fa", content: "ACGT", size: 4, fileType: "fa" },
        { name: "b.fastq", content: "@r\nACGT", size: 7, fileType: "fastq" },
      ],
      label: "2 files selected",
      subtitle: "Total size: 0.01 KB",
      outputs: [{ name: "ch_files_out", isConnectable: true }],
    });
    expect(
      screen.getByText("added 2 new files: a.fa, b.fastq"),
    ).toBeTruthy();
    expect(shownFiles()).toEqual(["a.fa", "b.fastq"]);
  });

  it("replaces files of the same name and clears the re-upload warning", async () => {
    const { updateNodeData, view, user } = setup([file("a.txt", ""), file("b.txt", "b")]);
    expect(
      screen.getByText(/1 file from this saved workflow is missing content/),
    ).toBeTruthy();
    expect(screen.getByText("Missing: a.txt")).toBeTruthy();
    expect(screen.getByText("NEEDS UPLOAD")).toBeTruthy();

    await user.upload(fileInput(view.container), [
      new File(["new a"], "a.txt"),
      new File(["c"], "c.txt"),
    ]);
    await screen.findByText("Replaced 1 file: a.txt and added 1 new file: c.txt");
    expect(updateNodeData.mock.calls[0][1].files?.map((f) => f.content)).toEqual([
      "new a",
      "b",
      "c",
    ]);
    expect(screen.queryByText(/missing content/)).toBeNull();
  });

  it("hides the success message after five seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { view } = setup([]);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.upload(fileInput(view.container), new File(["a"], "one.txt"));
    await screen.findByText("added 1 new file: one.txt");
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.queryByText("added 1 new file: one.txt")).toBeNull();
    vi.useRealTimers();
  });

  it("shows an error when a file can't be read", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = new File(["a"], "bad.txt");
    bad.arrayBuffer = () => Promise.reject(new Error("unreadable"));
    const { updateNodeData, view, user } = setup([]);
    await user.upload(fileInput(view.container), bad);
    await screen.findByText("An error occurred during file processing.");
    expect(updateNodeData).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Add Files" })).toHaveProperty(
      "disabled",
      false,
    );
    error.mockRestore();
  });

  it("removes a single file", async () => {
    const { updateNodeData, user } = setup([file("a.txt", "aa"), file("b.txt", "b")]);
    await user.click(screen.getByRole("button", { name: "Remove a.txt" }));
    expect(updateNodeData).toHaveBeenLastCalledWith("node-fileInput", {
      files: [file("b.txt", "b")],
      label: "1 file selected",
      subtitle: "Total size: 0.00 KB",
      outputs: [{ name: "ch_files_out", isConnectable: true }],
    });
    expect(shownFiles()).toEqual(["b.txt"]);

    await user.click(screen.getByRole("button", { name: "Remove b.txt" }));
    expect(updateNodeData).toHaveBeenLastCalledWith("node-fileInput", {
      files: [],
      label: "Select File(s)",
      subtitle: undefined,
      outputs: [{ name: "ch_files_out", isConnectable: false }],
    });
    expect(screen.getByText("No files have been added.")).toBeTruthy();
  });

  it("removes the selected files together", async () => {
    const { updateNodeData, user } = setup([
      file("a.txt", "a"),
      file("b.txt", ""),
      file("c.txt", ""),
    ]);
    await user.click(screen.getByRole("button", { name: "Select Missing (2)" }));
    expect(screen.getByRole("button", { name: "Clear (2)" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear (2)" }));
    expect(screen.queryByRole("button", { name: /Clear/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Select All" }));
    // Unselect a.txt by clicking its row.
    await user.click(screen.getByText("a.txt"));
    await user.click(screen.getByRole("button", { name: "Remove Selected" }));
    expect(updateNodeData).toHaveBeenLastCalledWith("node-fileInput", {
      files: [file("a.txt", "a")],
      label: "1 file selected",
      subtitle: "Total size: 0.00 KB",
      outputs: [{ name: "ch_files_out", isConnectable: true }],
    });
    expect(shownFiles()).toEqual(["a.txt"]);
  });

  it("removes everything selected", async () => {
    const { updateNodeData, user } = setup([file("a.txt", "a"), file("b.txt", "b")]);
    await user.click(screen.getByRole("button", { name: "Select All" }));
    await user.click(screen.getByRole("button", { name: "Remove Selected" }));
    expect(updateNodeData).toHaveBeenLastCalledWith(
      "node-fileInput",
      expect.objectContaining({ files: [], label: "Select File(s)" }),
    );
  });

  it("searches files by name and type", async () => {
    const { user } = setup([
      file("sample_R1.fastq", "r", "fastq"),
      file("genome.fa", "g", "fa"),
      file("notes.txt", "n", "txt"),
    ]);
    const search = screen.getByPlaceholderText("Search files...");
    await user.type(search, "FASTQ");
    expect(shownFiles()).toEqual(["sample_R1.fastq"]);
    expect(screen.getByText("Showing 1 of 3 files")).toBeTruthy();

    await user.clear(search);
    await user.type(search, "genome");
    expect(shownFiles()).toEqual(["genome.fa"]);

    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText("No files match your search.")).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Clear search to see all files" }),
    );
    expect(shownFiles()).toHaveLength(3);
  });

  it("highlights the drop area while dragging files over it", async () => {
    setup([]);
    const area = screen.getByText("No files have been added.").closest("div[tabindex]");
    if (!area) throw new Error("No drop area");
    const dataTransfer = {
      files: [new File(["a"], "a.txt")],
      items: [{ kind: "file", type: "text/plain", getAsFile: () => null }],
      types: ["Files"],
    };
    fireEvent.dragEnter(area, { dataTransfer });
    expect(await screen.findByText("Drop files here to add them")).toBeTruthy();
  });

  it("opens the file picker from the Add Files button", async () => {
    const { view, user } = setup([]);
    const click = vi.spyOn(fileInput(view.container), "click");
    await user.click(screen.getByRole("button", { name: "Add Files" }));
    expect(click).toHaveBeenCalled();
  });
});
