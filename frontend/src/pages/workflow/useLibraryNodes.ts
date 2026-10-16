// Register installed nf-core modules and custom nodes, so saved workflows
// that use them generate code without opening the node menu.

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Node } from "reactflow";
import { migrateLegacyCustomNodes, refreshCustomNodes } from "../../api/customNodes";
import { refreshInstalledNfCoreNodes } from "../../api/nfcore";
import type { NodeData } from "../../components/nodes/BaseNode";
import { getMissingNfCoreComponents } from "../../registry/nfcore/missingComponents";

export const useLibraryNodes = (nodes: Node<NodeData>[]) => {
  // Bumped when installed nf-core nodes are (re)loaded into the registry.
  const [nfCoreRegistryVersion, setNfCoreRegistryVersion] = useState(0);

  const reloadInstalledNfCore = useCallback(() => {
    refreshInstalledNfCoreNodes()
      .catch(() => 0)
      .finally(() => setNfCoreRegistryVersion((version) => version + 1));
  }, []);

  // nf-core components the canvas uses but that aren't installed; known
  // only once the installed ones were loaded.
  const missingNfCoreComponents = useMemo(
    () => (nfCoreRegistryVersion > 0 ? getMissingNfCoreComponents(nodes) : []),
    [nodes, nfCoreRegistryVersion],
  );

  useEffect(() => {
    reloadInstalledNfCore();
    migrateLegacyCustomNodes()
      .catch(() => 0)
      .finally(() => {
        refreshCustomNodes().catch(() => 0);
      });
  }, [reloadInstalledNfCore]);

  return { missingNfCoreComponents, reloadInstalledNfCore };
};
