import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Node } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NodeData, PortData } from "../../nodes/BaseNode";

// The views inside the panel have their own tests; stubs show what they get.
vi.mock("./NodeCodeView", () => ({
  default: ({ node }: { node: Node<NodeData> }) => <p>Code of {node.id}</p>,
}));
vi.mock("./NodeRunResults", () => ({
  default: ({ nodeId }: { nodeId: string }) => <p>Results of {nodeId}</p>,
}));
vi.mock("../operator/OperatorNodePanel", () => ({
  default: ({ node }: { node: Node<NodeData> }) => (
    <p>Operator settings of {node.id}</p>
  ),
}));
vi.mock("../process/NfCoreModuleDocs", () => ({
  default: (props: {
    moduleId: string;
    inputs: PortData[];
    outputs: PortData[];
  }) => (
    <p>
      Docs of {props.moduleId}: {props.inputs.map((port) => port.name).join(",")}{" "}
      / {props.outputs.map((port) => port.name).join(",")}
    </p>
  ),
}));

const { RunTasksContext } = await import("../../../execution/RunTasksContext");
const { default: PropertiesPanel } = await import("./PropertiesPanel");
// Loaded after the panel: loading the node definitions first goes through an
// import cycle that leaves registry/index without their exports.
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
type Props = React.ComponentProps<typeof PropertiesPanel>;

const show = (props: Partial<Props> = {}, ran = false) => {
  const all: Props = {
    node: makeNode("note", { noteText: "Read me" }),
    onClose: vi.fn(),
    onSave: vi.fn(),
    onDelete: vi.fn(),
    ...props,
  };
  const wrap = (p: Props) => (
    <RunTasksContext.Provider
      value={{
        runId: ran ? "run-1" : null,
        nodeRuns: ran
          ? {
              [p.node.id]: {
                status: "succeeded",
                total: 0,
                done: 0,
                failed: 0,
                running: 0,
                cached: 0,
                tasks: [],
              },
            }
          : {},
      }}
    >
      <PropertiesPanel {...p} />
    </RunTasksContext.Provider>
  );
  const view = render(wrap(all));
  return {
    ...view,
    all,
    rerender: (next: Partial<Props>) => view.rerender(wrap({ ...all, ...next })),
  };
};

const panel = () => screen.getByRole("dialog");
const header = () =>
  screen.getByRole("heading", { level: 2 }).parentElement
    ?.parentElement as HTMLElement;

describe("PropertiesPanel", () => {
  afterEach(() => {
    localStorage.clear();
  });

  describe("settings", () => {
    it("is titled with the node label", () => {
      show();
      expect(panel().getAttribute("aria-label")).toBe("Note");
      expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Note");
    });

    it("falls back to Properties without a label", () => {
      show({ node: makeNode("note", { label: "" }) });
      expect(panel().getAttribute("aria-label")).toBe("Properties");
    });

    it("saves the label as it is typed", async () => {
      const { all } = show();
      const input = screen.getByLabelText("Label");
      fireEvent.change(input, { target: { value: "Intro" } });
      expect(all.onSave).toHaveBeenCalledWith("node-note", { label: "Intro" });
      expect((input as HTMLInputElement).value).toBe("Intro");
    });

    it("follows label changes from outside", () => {
      const { rerender } = show();
      rerender({ node: makeNode("note", { label: "Renamed" }) });
      expect((screen.getByLabelText("Label") as HTMLInputElement).value).toBe(
        "Renamed",
      );
    });

    it("shows the node type's own settings", () => {
      const { all } = show();
      const text = screen.getByLabelText("Note text") as HTMLTextAreaElement;
      expect(text.value).toBe("Read me");
      fireEvent.change(text, { target: { value: "New" } });
      expect(all.onSave).toHaveBeenCalledWith("node-note", { noteText: "New" });
    });

    it("uses the operator panel for operators", () => {
      show({ node: makeNode("map") });
      expect(screen.getByText("Operator settings of node-map")).toBeTruthy();
    });

    it("says when a node type has no settings", () => {
      show({ node: makeNode("outputDisplay") });
      expect(
        screen.getByText("No properties available for this node type."),
      ).toBeTruthy();
    });

    it("explains an nf-core module that is not installed", () => {
      show({
        node: makeNode("outputDisplay", {
          nwaveNfCoreModuleId: "samtools/sort",
          inputs: [{ name: "bam" }],
          outputs: [],
        }),
      });
      expect(screen.getByText(/isn't installed on this server yet/)).toBeTruthy();
      // Ports come from the node, or from its definition when it has none.
      expect(screen.getByText("Docs of samtools/sort: bam /")).toBeTruthy();
    });

    it("can't be edited while the workflow runs", () => {
      show({ locked: true });
      expect(screen.getByText("Locked while the workflow runs.")).toBeTruthy();
      expect(
        (screen.getByLabelText("Label") as HTMLInputElement).matches(":disabled"),
      ).toBe(true);
      expect(
        (screen.getByRole("button", { name: "Delete Node" }) as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });
  });

  describe("tabs", () => {
    it("switches between settings, code and results", async () => {
      show();
      const user = userEvent.setup();
      expect(
        screen.getByRole("tab", { name: "Settings" }).getAttribute("aria-selected"),
      ).toBe("true");

      await user.click(screen.getByRole("tab", { name: "Code" }));
      expect(screen.getByRole("tabpanel").textContent).toBe("Code of node-note");

      await user.click(screen.getByRole("tab", { name: "Results" }));
      expect(screen.getByRole("tabpanel").textContent).toBe(
        "Results of node-note",
      );
      expect(
        screen.getByRole("tab", { name: "Results" }).getAttribute("aria-selected"),
      ).toBe("true");
    });

    it("moves between tabs with the arrow keys", async () => {
      show();
      const user = userEvent.setup();
      screen.getByRole("tab", { name: "Settings" }).focus();
      await user.keyboard("{ArrowLeft}");
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: "Results" }),
      );
      await user.keyboard("{ArrowRight}");
      expect(document.activeElement).toBe(
        screen.getByRole("tab", { name: "Settings" }),
      );
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("tabpanel").textContent).toBe("Code of node-note");
    });

    it("marks Results when the node ran", () => {
      const { unmount } = show();
      expect(
        screen.getByRole("tab", { name: "Results" }).querySelector("span"),
      ).toBeNull();
      unmount();
      show({}, true);
      expect(
        screen.getByRole("tab", { name: "Results" }).querySelector("span"),
      ).toBeTruthy();
    });
  });

  describe("closing and deleting", () => {
    it("closes", async () => {
      const { all } = show();
      await userEvent.setup().click(screen.getByRole("button", { name: "Close Panel" }));
      expect(all.onClose).toHaveBeenCalledOnce();
    });

    it("deletes after confirmation", async () => {
      const { all } = show();
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Delete Node" }));
      expect(
        screen.getByText(
          'Are you sure you want to delete the node "Note"? This action cannot be undone.',
        ),
      ).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Confirm" }));
      expect(all.onDelete).toHaveBeenCalledWith(all.node);
      expect(all.onClose).toHaveBeenCalledOnce();
    });

    it("keeps the node when deletion is cancelled", async () => {
      const { all } = show({ node: makeNode("note", { label: "" }) });
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Delete Node" }));
      expect(screen.getByText(/delete the node "Unnamed Node"/)).toBeTruthy();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(screen.queryByText(/delete the node/)).toBeNull();
      expect(all.onDelete).not.toHaveBeenCalled();
    });
  });

  describe("moving and resizing", () => {
    it("reports hover and focus", () => {
      const onMouseEnter = vi.fn();
      const onMouseLeave = vi.fn();
      const onFocus = vi.fn();
      show({ onMouseEnter, onMouseLeave, onFocus });
      fireEvent.mouseEnter(panel());
      fireEvent.mouseLeave(panel());
      fireEvent.mouseDown(panel());
      expect(onMouseEnter).toHaveBeenCalledOnce();
      expect(onMouseLeave).toHaveBeenCalledOnce();
      expect(onFocus).toHaveBeenCalledOnce();
    });

    it("opens near the right edge", () => {
      show();
      expect(panel().style.left).toBe(`${window.innerWidth - 580}px`);
      expect(panel().style.top).toBe("20px");
      expect(panel().style.width).toBe("560px");
    });

    it("is dragged by its header and stays on screen", () => {
      show();
      const start = window.innerWidth - 580;
      fireEvent.mouseDown(header(), { clientX: start + 10, clientY: 30 });
      fireEvent.mouseMove(window, { clientX: 110, clientY: 130 });
      expect(panel().style.left).toBe("100px");
      expect(panel().style.top).toBe("120px");

      fireEvent.mouseMove(window, { clientX: -500, clientY: -500 });
      expect(panel().style.left).toBe("0px");
      expect(panel().style.top).toBe("0px");

      fireEvent.mouseMove(window, { clientX: 99999, clientY: 99999 });
      expect(panel().style.left).toBe(`${window.innerWidth - 560}px`);
      expect(panel().style.top).toBe(`${window.innerHeight - 45}px`);

      fireEvent.mouseUp(window);
      fireEvent.mouseMove(window, { clientX: 110, clientY: 130 });
      expect(panel().style.top).toBe(`${window.innerHeight - 45}px`);
      // Dragging doesn't store a size.
      expect(localStorage.getItem("panel-size-node-note")).toBeNull();
    });

    it("is resized by its corner and remembers the size", () => {
      const { container } = show();
      const corner = container.querySelector(".cursor-nwse-resize") as Element;
      fireEvent.mouseDown(corner, { clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: 40, clientY: 50 });
      expect(panel().style.width).toBe("600px");
      expect(panel().style.height).toBe("650px");

      fireEvent.mouseMove(window, { clientX: -2000, clientY: -2000 });
      expect(panel().style.width).toBe("300px");
      expect(panel().style.height).toBe("200px");

      fireEvent.mouseUp(window);
      expect(JSON.parse(localStorage.getItem("panel-size-node-note") ?? "")).toEqual(
        { width: 300, height: 200 },
      );
    });

    it("opens at the remembered size, no smaller than the minimum", () => {
      localStorage.setItem(
        "panel-size-node-note",
        JSON.stringify({ width: 100, height: 700 }),
      );
      show();
      expect(panel().style.width).toBe("300px");
      expect(panel().style.height).toBe("700px");
    });

    it("ignores an unreadable remembered size", () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      localStorage.setItem("panel-size-node-note", "{oops");
      show();
      expect(panel().style.width).toBe("560px");
      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });

    it("moves back to the right edge when asked", () => {
      const { rerender } = show();
      fireEvent.mouseDown(header(), { clientX: 0, clientY: 0 });
      fireEvent.mouseMove(window, { clientX: -1000, clientY: 0 });
      fireEvent.mouseUp(window);
      expect(panel().style.left).toBe("0px");
      rerender({ recenterTrigger: 1 });
      expect(panel().style.left).toBe(`${window.innerWidth - 560 - 20}px`);
    });
  });
});
