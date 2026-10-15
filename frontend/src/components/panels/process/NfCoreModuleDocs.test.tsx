import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Node } from "reactflow";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../../nodes/BaseNode";

const META = `
description: Quantify transcripts with Salmon
tools:
  - salmon:
      description: Transcript quantification
      homepage: https://combine-lab.github.io/salmon/
      documentation: https://salmon.readthedocs.io/en/latest/
input:
  - - meta2:
        type: map
        description: reference information
    - index:
        type: directory
        description: Folder containing the salmon index files.
    - gtf:
        type: file
        description: GTF of the reference transcriptome
output:
  results:
    - - meta:
          type: map
          description: sample information
      - \${prefix}:
          type: directory
          description: Folder containing the quantification results
`;

const getNfCoreModuleInfo = vi.fn(async (_id: string) => ({
  source: "process SALMON_QUANT {\n}",
  meta: META,
}));
vi.mock("../../../api/nfcore", () => ({
  getNfCoreModuleInfo: (id: string) => getNfCoreModuleInfo(id),
  getNfCoreModuleSource: async (id: string) =>
    (await getNfCoreModuleInfo(id)).source,
}));

const { default: NfCoreModuleDocs } = await import("./NfCoreModuleDocs");
const { default: NodeCodeView } = await import("../base/NodeCodeView");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => {});

describe("NfCoreModuleDocs", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("describes the module, links its docs and explains each port", async () => {
    act(() =>
      root.render(
        <NfCoreModuleDocs
          moduleId="nf-core/salmon/quant"
          inputs={[{ name: "index", label: "Index" }]}
          outputs={[
            { name: "results", label: "Results" },
            { name: "versions_salmon", label: "Versions" },
          ]}
        />,
      ),
    );
    await flush();
    expect(getNfCoreModuleInfo).toHaveBeenCalledWith("nf-core/salmon/quant");
    expect(container.textContent).toContain("Quantify transcripts with Salmon");

    const links = [...container.querySelectorAll("a")].map((link) => [
      link.textContent,
      link.getAttribute("href"),
    ]);
    expect(links).toEqual([
      ["nf-core documentation", "https://nf-co.re/modules/salmon_quant"],
      ["salmon documentation", "https://salmon.readthedocs.io/en/latest/"],
      ["salmon homepage", "https://combine-lab.github.io/salmon/"],
    ]);

    // The index port carries the whole tuple: its files are listed.
    const inputs = container.querySelector('[aria-label="Inputs"]');
    expect(inputs?.textContent).toContain("Carries 2 files together");
    expect(inputs?.textContent).toContain("GTF of the reference transcriptome");

    const outputs = container.querySelector('[aria-label="Outputs"]');
    expect(outputs?.textContent).toContain(
      "Folder containing the quantification results",
    );
    expect(outputs?.textContent).toContain("Not described");
  });

  it("describes a tuple file by itself when it has its own port", async () => {
    act(() =>
      root.render(
        <NfCoreModuleDocs
          moduleId="nf-core/salmon/quant"
          inputs={[
            { name: "index", label: "Index" },
            { name: "gtf", label: "Gtf" },
          ]}
          outputs={[]}
        />,
      ),
    );
    await flush();
    const inputs = container.querySelector('[aria-label="Inputs"]');
    expect(inputs?.textContent).not.toContain("Carries");
    expect(inputs?.textContent).toContain(
      "Folder containing the salmon index files.",
    );
    expect(inputs?.textContent).toContain("GTF of the reference transcriptome");
  });

  it("still links the docs when the description can't be loaded", async () => {
    getNfCoreModuleInfo.mockRejectedValueOnce(new Error("offline"));
    act(() =>
      root.render(
        <NfCoreModuleDocs moduleId="nf-core/fastqc" inputs={[]} outputs={[]} />,
      ),
    );
    await flush();
    expect(container.textContent).toContain("offline");
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "https://nf-co.re/modules/fastqc",
    );
  });

  it("shows an uninstalled module's code on the Code tab", async () => {
    const node = {
      id: "salmon",
      type: "process",
      position: { x: 0, y: 0 },
      data: {
        label: "Salmon",
        processType: "nfcore_not_installed",
        nwaveNfCoreModuleId: "nf-core/salmon/quant",
      },
    } as Node<NodeData>;
    act(() => root.render(<NodeCodeView node={node} />));
    await flush();
    expect(container.textContent).toContain("isn't installed on this server");
    expect(container.textContent).not.toContain(
      "doesn't generate a process",
    );
    expect(container.textContent).toContain("process SALMON_QUANT");
  });
});
