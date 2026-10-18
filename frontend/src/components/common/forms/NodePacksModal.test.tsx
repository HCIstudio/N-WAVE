import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodePackImportResult } from "../../../api/nodePacks";
import type { StoredCustomNode } from "../../../registry/customNodes";
import type {
  InstalledNodePack,
  NodePackNfCoreRefs,
} from "../../../registry/nodePacks";

const INDEX_URL = "https://packs.example/index.json";

const refreshCustomNodes = vi.fn(async (): Promise<StoredCustomNode[]> => []);
vi.mock("../../../api", () => ({ default: {}, isDemoMode: false }));
vi.mock("../../../api/customNodes", () => ({
  refreshCustomNodes: () => refreshCustomNodes(),
}));
const fetchNodePackText = vi.fn(async (_url: string) => "");
const getMissingNfCoreComponents = vi.fn(
  async (_refs: NodePackNfCoreRefs[]): Promise<string[]> => [],
);
const importPackNodes = vi.fn(
  async (
    nodes: StoredCustomNode[],
    _missing: string[],
  ): Promise<NodePackImportResult> => ({
    saved: nodes,
    installedComponents: [],
    failures: [],
  }),
);
const removeNodePack = vi.fn(async (_pack: InstalledNodePack) => {});
vi.mock("../../../api/nodePacks", () => ({
  NODE_PACK_INDEX_URL: INDEX_URL,
  fetchNodePackText: (url: string) => fetchNodePackText(url),
  getMissingNfCoreComponents: (refs: NodePackNfCoreRefs[]) =>
    getMissingNfCoreComponents(refs),
  importPackNodes: (nodes: StoredCustomNode[], missing: string[]) =>
    importPackNodes(nodes, missing),
  removeNodePack: (pack: InstalledNodePack) => removeNodePack(pack),
}));

const { default: NodePacksModal } = await import("./NodePacksModal");
const { createStoredCustomNode, parseCustomNodeSource } = await import(
  "../../../registry/customNodes"
);
const { buildNodePack, serializeNodePack } = await import(
  "../../../registry/nodePacks"
);

const makeCustomNode = (
  processName: string,
  label: string,
  extra: Partial<StoredCustomNode> = {},
): StoredCustomNode => {
  const source = [
    `process ${processName} {`,
    "  input:",
    "  path reads",
    "  output:",
    '  path "out.txt", emit: out',
    "  script:",
    '  """',
    "  cat $reads > out.txt",
    '  """',
    "}",
  ].join("\n");
  const parsed = parseCustomNodeSource(source);
  const node = createStoredCustomNode(
    { label, description: `${label} node`, icon: "Code", source },
    parsed,
    { inputs: parsed.inputs, outputs: parsed.outputs },
  );
  const id = extra.id ?? `custom_${processName.toLowerCase()}`;
  return { ...node, id, processType: id, ...extra };
};

const trim = makeCustomNode("TRIM", "Trim");
const count = makeCustomNode("COUNT", "Count");

const packText = (nodes: StoredCustomNode[], name = "Read tools") =>
  serializeNodePack(
    buildNodePack(
      { name, version: "1.0.0", author: "Ada", description: "Read helpers" },
      nodes,
    ),
  );

const fromPack = (
  node: StoredCustomNode,
  pack = { id: "read-tools", name: "Read tools", version: "0.9.0" },
): StoredCustomNode => ({ ...node, pack });

const setup = async (installed: StoredCustomNode[] = []) => {
  refreshCustomNodes.mockResolvedValue(installed);
  const onClose = vi.fn();
  const onChanged = vi.fn();
  const user = userEvent.setup();
  render(<NodePacksModal isOpen onClose={onClose} onChanged={onChanged} />);
  await waitFor(() => expect(refreshCustomNodes).toHaveBeenCalled());
  return { user, onClose, onChanged };
};

const openTab = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) => {
  await user.click(screen.getByRole("tab", { name }));
};

const uploadPack = async (
  user: ReturnType<typeof userEvent.setup>,
  text: string,
) => {
  await user.upload(
    screen.getByLabelText("Node pack file"),
    new File([text], "pack.json", { type: "application/json" }),
  );
};

const button = (name: string | RegExp) =>
  screen.getByRole("button", { name }) as HTMLButtonElement;

describe("NodePacksModal", () => {
  beforeEach(() => {
    refreshCustomNodes.mockReset();
    fetchNodePackText.mockReset();
    getMissingNfCoreComponents.mockReset();
    getMissingNfCoreComponents.mockResolvedValue([]);
    importPackNodes.mockClear();
    removeNodePack.mockReset();
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <NodePacksModal isOpen={false} onClose={vi.fn()} onChanged={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
    expect(refreshCustomNodes).not.toHaveBeenCalled();
  });

  it("closes from the close button", async () => {
    const { user, onClose } = await setup();
    await user.click(button("Close node packs"));
    expect(onClose).toHaveBeenCalled();
  });

  describe("installed", () => {
    it("says when no packs are installed", async () => {
      await setup();
      expect(
        await screen.findByText("No packs installed. Import one in the Import tab."),
      ).toBeTruthy();
    });

    it("shows a load error", async () => {
      refreshCustomNodes.mockRejectedValue(new Error("backend down"));
      const user = userEvent.setup();
      render(<NodePacksModal isOpen onClose={vi.fn()} onChanged={vi.fn()} />);
      expect((await screen.findByRole("alert")).textContent).toBe(
        "Custom nodes couldn't be loaded: backend down",
      );
      await openTab(user, "Export");
      expect(screen.getByRole("tab", { name: "Export" }).getAttribute("aria-selected")).toBe("true");
    });

    it("groups installed nodes by pack and counts local ones", async () => {
      await setup([fromPack(trim), fromPack(count), makeCustomNode("MINE", "Mine")]);
      const pack = await screen.findByRole("listitem", {
        name: "Read tools 0.9.0",
      });
      expect(within(pack).getByText("Trim, Count")).toBeTruthy();
      expect(
        screen.getByText(/1 custom node made here \(not from a pack\)/),
      ).toBeTruthy();
    });

    it("removes a pack after confirming", async () => {
      const { user, onChanged } = await setup([fromPack(trim), fromPack(count)]);
      await user.click(await screen.findByRole("button", { name: "Remove Read tools" }));
      expect(
        screen.getByText(/Delete its 2 nodes\? Saved workflows lose them\./),
      ).toBeTruthy();

      refreshCustomNodes.mockResolvedValue([]);
      await user.click(button("Remove"));

      expect(removeNodePack).toHaveBeenCalledWith(
        expect.objectContaining({ id: "read-tools", nodes: [expect.objectContaining({ id: trim.id }), expect.objectContaining({ id: count.id })] }),
      );
      await waitFor(() => expect(onChanged).toHaveBeenCalled());
      expect(
        await screen.findByText("No packs installed. Import one in the Import tab."),
      ).toBeTruthy();
    });

    it("keeps the pack when the confirmation is cancelled", async () => {
      const { user } = await setup([fromPack(trim)]);
      await user.click(await screen.findByRole("button", { name: "Remove Read tools" }));
      expect(screen.getByText(/Delete its 1 node\?/)).toBeTruthy();
      await user.click(button("Cancel"));
      expect(button("Remove Read tools")).toBeTruthy();
      expect(removeNodePack).not.toHaveBeenCalled();
    });

    it("shows why a pack couldn't be removed", async () => {
      removeNodePack.mockRejectedValue(new Error("locked"));
      const { user, onChanged } = await setup([fromPack(trim)]);
      await user.click(await screen.findByRole("button", { name: "Remove Read tools" }));
      await user.click(button("Remove"));
      expect((await screen.findByRole("alert")).textContent).toBe("locked");
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  describe("import", () => {
    it("previews a pack file and imports its nodes", async () => {
      getMissingNfCoreComponents.mockResolvedValue(["nf-core/fastqc"]);
      importPackNodes.mockImplementationOnce(async (nodes) => ({
        saved: nodes,
        installedComponents: ["nf-core/fastqc"],
        failures: ["Count: disk full"],
      }));
      const { user, onChanged } = await setup();
      await openTab(user, "Import");
      await uploadPack(user, packText([trim, count]));

      const preview = await screen.findByRole("region", { name: "Pack preview" });
      expect(
        within(preview).getByRole("heading").textContent,
      ).toBe("Read tools 1.0.0 · read-tools · Ada");
      expect(within(preview).getByText("Read helpers")).toBeTruthy();
      expect(within(preview).getByRole("listitem", { name: "Trim" })).toBeTruthy();
      expect(
        await within(preview).findByText(
          "Also installs the nf-core components these nodes include: nf-core/fastqc.",
        ),
      ).toBeTruthy();

      await user.click(button("Import 2 nodes"));

      const [nodes, missing] = importPackNodes.mock.calls[0];
      expect(nodes.map((node) => node.id)).toEqual([trim.id, count.id]);
      expect(nodes[0].pack).toEqual({
        id: "read-tools",
        name: "Read tools",
        version: "1.0.0",
      });
      expect(missing).toEqual(["nf-core/fastqc"]);
      const result = await screen.findByRole("status");
      expect(result.textContent).toContain(
        "Imported 2 nodes and installed 1 nf-core component. They're in the Add node menu under \"Pack: Read tools\".",
      );
      expect(within(result).getByText("Count: disk full")).toBeTruthy();
      expect(onChanged).toHaveBeenCalled();
      // A finished import can't be repeated by accident.
      expect(button(/Import 2 nodes/).disabled).toBe(true);
    });

    it("lists why a file isn't a node pack", async () => {
      const { user } = await setup();
      await openTab(user, "Import");
      await uploadPack(user, "{ not json");

      const alert = await screen.findByRole("alert");
      expect(within(alert).getByText("This pack can't be imported:")).toBeTruthy();
      expect(alert.textContent).toContain("The file isn't valid JSON");
      expect(screen.queryByRole("region", { name: "Pack preview" })).toBeNull();
    });

    it("skips nodes with errors", async () => {
      const pack = JSON.parse(packText([trim, count]));
      pack.nodes[1].processName = "WRONG";
      const { user } = await setup();
      await openTab(user, "Import");
      await uploadPack(user, JSON.stringify(pack));

      const broken = await screen.findByRole("listitem", { name: "Count" });
      expect(broken.textContent).toContain(
        'The source declares process COUNT, but "processName" is WRONG.',
      );
      expect(screen.getByText("Nodes with errors are skipped.")).toBeTruthy();
      expect(button("Import 1 node")).toBeTruthy();
    });

    it("updates nodes from the same pack by default", async () => {
      const { user } = await setup([fromPack(trim)]);
      await openTab(user, "Import");
      await uploadPack(user, packText([trim]));

      expect(
        await screen.findByText(/Already installed from this pack \(0\.9\.0\)\./),
      ).toBeTruthy();
      const choice = screen.getByLabelText(
        "When Trim is already installed",
      ) as HTMLSelectElement;
      expect(choice.value).toBe("replace");
      await user.click(button("Import 1 node"));
      expect(importPackNodes.mock.calls[0][0].map((node) => node.id)).toEqual([
        trim.id,
      ]);
    });

    it("renames or skips nodes whose id is taken", async () => {
      const other = fromPack(count, {
        id: "other",
        name: "Other pack",
        version: "2.0.0",
      });
      const { user } = await setup([trim, other]);
      await openTab(user, "Import");
      await uploadPack(user, packText([trim, count]));

      expect(
        await screen.findByText(/The id is used by your custom node "Trim"\./),
      ).toBeTruthy();
      expect(
        screen.getByText(/The id is used by "Count" from Other pack\./),
      ).toBeTruthy();
      const trimChoice = screen.getByLabelText(
        "When Trim is already installed",
      ) as HTMLSelectElement;
      expect(trimChoice.value).toBe("keep-both");
      await user.selectOptions(
        screen.getByLabelText("When Count is already installed"),
        "skip",
      );

      await user.click(button("Import 1 node"));
      expect(importPackNodes.mock.calls[0][0].map((node) => node.id)).toEqual([
        `${trim.id}_2`,
      ]);
    });

    it("can't import when every node is skipped", async () => {
      const { user } = await setup([trim]);
      await openTab(user, "Import");
      await uploadPack(user, packText([trim]));
      await user.selectOptions(
        await screen.findByLabelText("When Trim is already installed"),
        "skip",
      );
      expect(button("Import 0 nodes").disabled).toBe(true);
    });

    it("loads a pack from a URL", async () => {
      fetchNodePackText.mockResolvedValue(packText([trim]));
      const { user } = await setup();
      await openTab(user, "Import");
      expect(button("Load").disabled).toBe(true);
      await user.type(
        screen.getByLabelText("From a URL"),
        "  https://packs.example/read-tools.json ",
      );
      await user.click(button("Load"));

      expect(fetchNodePackText).toHaveBeenCalledWith(
        "https://packs.example/read-tools.json",
      );
      expect(await screen.findByRole("listitem", { name: "Trim" })).toBeTruthy();
    });

    it("shows why a URL couldn't be loaded", async () => {
      fetchNodePackText.mockRejectedValue(new Error("The server answered 404."));
      const { user } = await setup();
      await openTab(user, "Import");
      await user.type(screen.getByLabelText("From a URL"), "https://x.example/p{Enter}");
      expect((await screen.findByRole("alert")).textContent).toBe(
        "The server answered 404.",
      );
    });

    it("lists community packs and loads one", async () => {
      fetchNodePackText.mockImplementation(async (url) =>
        url === INDEX_URL
          ? JSON.stringify({
              format: "n-wave-node-pack-index",
              packs: [
                {
                  name: "Read tools",
                  version: "1.0.0",
                  author: "Ada",
                  description: "Read helpers",
                  url: "read-tools.json",
                },
                { name: "Broken" },
              ],
            })
          : packText([trim]),
      );
      const { user } = await setup();
      await openTab(user, "Import");
      await user.click(screen.getByText("Community packs", { selector: "summary" }));

      const list = await screen.findByRole("list", { name: "Community packs" });
      const entry = await within(list).findByRole("listitem");
      expect(entry.textContent).toContain("Read tools 1.0.0 · Ada");
      expect(entry.textContent).toContain("Read helpers");
      expect(
        screen.getByText('Index entry 2 needs "name", "version" and "url".'),
      ).toBeTruthy();

      await user.click(within(entry).getByRole("button", { name: "Load" }));
      expect(fetchNodePackText).toHaveBeenLastCalledWith(
        "https://packs.example/read-tools.json",
      );
      expect(await screen.findByRole("listitem", { name: "Trim" })).toBeTruthy();
    });

    it("says when the community index is unreachable", async () => {
      fetchNodePackText.mockRejectedValue(new Error("offline"));
      const { user } = await setup();
      await openTab(user, "Import");
      await user.click(screen.getByText("Community packs", { selector: "summary" }));
      expect(
        await screen.findByText("The community index isn't reachable (offline)."),
      ).toBeTruthy();
    });
  });

  describe("export", () => {
    let createObjectURL: ReturnType<typeof vi.fn>;
    let clicked: HTMLAnchorElement[];

    beforeEach(() => {
      createObjectURL = vi.fn((_blob: Blob) => "blob:pack");
      clicked = [];
      URL.createObjectURL = createObjectURL as unknown as typeof URL.createObjectURL;
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        function (this: HTMLAnchorElement) {
          clicked.push(this);
        },
      );
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("says when there is nothing to export", async () => {
      const { user } = await setup();
      await openTab(user, "Export");
      expect(screen.getByText(/No custom nodes yet\./)).toBeTruthy();
    });

    it("downloads the selected nodes as a pack", async () => {
      const { user } = await setup([trim, fromPack(count)]);
      await openTab(user, "Export");
      expect(await screen.findByText("from Read tools")).toBeTruthy();
      expect(button("Download pack").disabled).toBe(true);

      await user.click(screen.getByRole("checkbox", { name: /Trim/ }));
      await user.click(screen.getByRole("checkbox", { name: /Count/ }));
      await user.click(screen.getByRole("checkbox", { name: /Count/ }));
      await user.type(screen.getByLabelText("Pack name"), "My Tools");
      const version = screen.getByLabelText("Version");
      await user.clear(version);
      await user.type(version, "2.1.0");
      await user.type(screen.getByLabelText("Description"), "Mine");
      await user.type(screen.getByLabelText("Author"), "Ada");
      await user.click(button("Download pack"));

      expect(clicked).toHaveLength(1);
      expect(clicked[0].download).toBe("my-tools-2.1.0.nwave-pack.json");
      const blob = createObjectURL.mock.calls[0][0] as Blob;
      const pack = JSON.parse(await blob.text());
      expect(pack).toMatchObject({
        format: "n-wave-node-pack",
        id: "my-tools",
        name: "My Tools",
        version: "2.1.0",
        description: "Mine",
        author: "Ada",
        createdWith: "N-WAVE dev",
      });
      expect(pack.nodes.map((node: { id: string }) => node.id)).toEqual([
        trim.id,
      ]);
    });

    it("refuses a pack that wouldn't import", async () => {
      const broken = { ...trim, processName: "OTHER" };
      const { user } = await setup([broken]);
      await openTab(user, "Export");
      await user.click(await screen.findByRole("checkbox", { name: /Trim/ }));
      await user.type(screen.getByLabelText("Pack name"), "Broken");
      await user.click(button("Download pack"));

      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("The pack wouldn't import cleanly:");
      expect(alert.textContent).toContain(
        'Trim: The source declares process TRIM, but "processName" is OTHER.',
      );
      expect(clicked).toHaveLength(0);
    });
  });
});
