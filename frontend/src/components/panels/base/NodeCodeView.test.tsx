import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Node } from "@xyflow/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeData } from "../../nodes/BaseNode";

vi.mock("../../../api/nfcore", () => ({
  getNfCoreModuleSource: async () => "process SALMON_QUANT {\n}",
}));

const { default: NodeCodeView } = await import("./NodeCodeView");
const { buildNfCoreManifest } = await import("../../../registry/nfcore/manifest");
const { createNodeDefinitionFromNfCoreManifest } = await import(
  "../../../registry/nfcoreModuleAdapters"
);
const { registerDynamicNodeDefinitions, unregisterDynamicNodeDefinitions } =
  await import("../../../registry/nodeDefinitions");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => {});

// A trimmed nf-core catalog entry (tsconfig.app.json, which type-checks
// .tsx tests, doesn't include the bundled catalog.json).
const salmonDefinition = createNodeDefinitionFromNfCoreManifest(
  buildNfCoreManifest({
    id: "nf-core/salmon/quant",
    modulePath: "salmon/quant",
    label: "salmon_quant",
    description: "Quantify transcripts with Salmon",
    processName: "SALMON_QUANT",
    inputs: ["reads", "index"],
    emits: ["results"],
    support: "candidate",
  }),
);

describe("NodeCodeView", () => {
  let container: HTMLDivElement;
  let root: Root;
  const definition = salmonDefinition;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    act(() => unregisterDynamicNodeDefinitions([definition.id]));
  });

  it("shows a module's code once it is registered after the panel opened", async () => {
    // After a reload a saved node is shown before the installed modules are
    // loaded into the registry.
    const node: Node<NodeData> = {
      id: "salmon",
      type: definition.type,
      position: { x: 0, y: 0 },
      data: {
        label: definition.label,
        icon: definition.icon,
        ...definition.defaults,
      },
    };
    act(() => root.render(<NodeCodeView node={node} />));
    await flush();
    expect(container.textContent).toContain("isn't installed on this server");
    expect(container.querySelector('[aria-label="Include statement"]')).toBeNull();

    act(() => registerDynamicNodeDefinitions([definition]));
    await flush();
    expect(container.textContent).not.toContain("isn't installed on this server");
    expect(
      container.querySelector('[aria-label="Include statement"]')?.textContent,
    ).toContain("./modules/nf-core/salmon/quant/main");
  });
});
