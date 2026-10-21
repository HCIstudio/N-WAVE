import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileObject, NodeData } from "../../nodes/BaseNode";

// The viewers have their own tests; the stub shows what would be displayed.
vi.mock("../../common", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../common")>()),
  FileViewer: (props: { content: string; fileName: string; fileType: string }) => (
    <section aria-label={`${props.fileName} as ${props.fileType}`}>
      {props.content}
    </section>
  ),
}));

const { default: OutputDisplayPanelContent } = await import(
  "./OutputDisplayPanelContent"
);
const { nodeDefinitions } = await import("../../../registry/nodeDefinitions");

// Built like src/test/nodes.ts's makeNode, which .tsx tests can't import:
// tsconfig.app.json type-checks them but excludes src/test.
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

const file = (name: string, content: string, order?: number): FileObject => ({
  name,
  content,
  size: content.length,
  order,
});

const files = [
  file("b.csv", "x,y\n1,2", 2),
  file("a.json", '{"ok":true}', 1),
  file("notes.txt", "hello"),
];

const show = (data: Partial<NodeData> = { files }) => {
  const onNodeDataChange = vi.fn();
  const node = makeNode("outputDisplay", { label: "Report", ...data });
  render(
    <OutputDisplayPanelContent node={node} onNodeDataChange={onNodeDataChange} />,
  );
  return { node, onNodeDataChange };
};

const fileSelect = () =>
  screen.getByLabelText("View File:") as HTMLSelectElement;
const formatSelect = () =>
  screen.getByLabelText("Download as:") as HTMLSelectElement;
const downloadButton = () =>
  screen.getByRole("button", { name: "Download Output" }) as HTMLButtonElement;

describe("OutputDisplayPanelContent", () => {
  it("renders nothing without a node", () => {
    const { container } = render(<OutputDisplayPanelContent node={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("shows all files joined, in their order", () => {
    const { onNodeDataChange } = show();
    const viewer = screen.getByLabelText("combined.txt as text");
    expect(viewer.textContent).toBe(
      '--- FILE: a.json ---\n\n{"ok":true}\n\n--- FILE: b.csv ---\n\nx,y\n1,2\n\n--- FILE: notes.txt ---\n\nhello',
    );
    // Just opening the panel doesn't change the node.
    expect(onNodeDataChange).not.toHaveBeenCalled();
  });

  it("lists every file to pick from", () => {
    show();
    const values = Array.from(fileSelect().options, (option) => option.value);
    expect(values[0]).toBe("all");
    expect(values.slice(1).sort()).toEqual(["a.json", "b.csv", "notes.txt"]);
  });

  it("shows one file with its type and stores the choice", async () => {
    const { onNodeDataChange } = show();
    await userEvent.setup().selectOptions(fileSelect(), "b.csv");
    expect(screen.getByLabelText("b.csv as csv").textContent).toBe("x,y\n1,2");
    expect(onNodeDataChange).toHaveBeenLastCalledWith("node-outputDisplay", {
      selectedFileName: "b.csv",
      downloadFormat: "txt",
    });
  });

  it("offers CSV and JSON only for a single file", async () => {
    show();
    const csv = () =>
      Array.from(formatSelect().options).find((o) => o.value === "csv");
    expect(csv()?.disabled).toBe(true);
    const user = userEvent.setup();
    await user.selectOptions(fileSelect(), "b.csv");
    expect(csv()?.disabled).toBe(false);
    await user.selectOptions(formatSelect(), "csv");
    expect(formatSelect().value).toBe("csv");
    // Back to all files: the format goes back to text.
    await user.selectOptions(fileSelect(), "all");
    expect(formatSelect().value).toBe("txt");
  });

  it("opens with the stored choice", () => {
    show({ files, selectedFileName: "a.json", downloadFormat: "json" });
    expect(fileSelect().value).toBe("a.json");
    expect(formatSelect().value).toBe("json");
    expect(screen.getByLabelText("a.json as json").textContent).toBe(
      '{"ok":true}',
    );
  });

  it("tells a binary file instead of showing it as text", () => {
    const gz: FileObject = { name: "reads.fastq.gz", content: "H4sIAA==", encoding: "base64", size: 4 };
    show({ files: [gz], selectedFileName: "reads.fastq.gz" });
    expect(screen.getByText(/is a binary file \(4 B\)/)).toBeTruthy();
    expect(screen.queryByText("H4sIAA==")).toBeNull();
  });

  it("says when there is nothing to show", () => {
    show({ files: [] });
    expect(screen.getByText("No content to display.")).toBeTruthy();
    expect(fileSelect().disabled).toBe(true);
    expect(downloadButton().disabled).toBe(true);
  });

  it("shows nothing for a file that is no longer there", () => {
    show({ files, selectedFileName: "gone.txt" });
    expect(screen.getByText("No content to display.")).toBeTruthy();
  });

  it("explains when preview is unavailable", () => {
    show({ files, previewUnavailable: true });
    expect(screen.getByText("Preview unavailable")).toBeTruthy();
    expect(
      screen.getByText(/does not provide browser preview output/),
    ).toBeTruthy();
    expect(fileSelect().disabled).toBe(true);
    expect(formatSelect().disabled).toBe(true);
    expect(downloadButton().disabled).toBe(true);
  });

  it("shows the given reason preview is unavailable", () => {
    show({
      files,
      previewUnavailable: true,
      previewUnavailableReason: "Pipelines publish their own reports.",
    });
    expect(screen.getByText("Pipelines publish their own reports.")).toBeTruthy();
  });

  describe("download", () => {
    let blobs: Blob[];
    let names: string[];

    beforeEach(() => {
      blobs = [];
      names = [];
      Object.assign(URL, {
        createObjectURL: vi.fn((blob: Blob) => {
          blobs.push(blob);
          return "blob:output";
        }),
        revokeObjectURL: vi.fn(),
      });
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        function (this: HTMLAnchorElement) {
          names.push(this.download);
        },
      );
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("downloads all files as text", async () => {
      show();
      fireEvent.click(downloadButton());
      expect(names).toEqual(["Report.txt"]);
      expect(blobs[0].type).toBe("text/plain;charset=utf-8");
      expect(await blobs[0].text()).toContain("--- FILE: a.json ---");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:output");
    });

    it("downloads one file as CSV", async () => {
      show({ files, selectedFileName: "b.csv", downloadFormat: "csv" });
      fireEvent.click(downloadButton());
      expect(names).toEqual(["Report_b.csv.csv"]);
      expect(blobs[0].type).toBe("text/csv;charset=utf-8");
      expect(await blobs[0].text()).toBe("x,y\n1,2");
    });

    it("pretty-prints JSON", async () => {
      show({ files, selectedFileName: "a.json", downloadFormat: "json" });
      fireEvent.click(downloadButton());
      expect(blobs[0].type).toBe("application/json");
      expect(await blobs[0].text()).toBe('{\n  "ok": true\n}');
    });

    it("downloads invalid JSON as text", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      show({ files, selectedFileName: "notes.txt", downloadFormat: "json" });
      fireEvent.click(downloadButton());
      expect(blobs[0].type).toBe("text/plain;charset=utf-8");
      expect(await blobs[0].text()).toBe("hello");
      expect(warn).toHaveBeenCalled();
    });

    it("names the file after the node id without a label", () => {
      show({ files, label: "" });
      fireEvent.click(downloadButton());
      expect(names).toEqual(["output_node-outputDisplay.txt"]);
    });
  });
});
