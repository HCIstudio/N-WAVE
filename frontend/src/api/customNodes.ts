import api from "../api";
import {
  registerCustomNodes,
  syncCustomNodes,
  unregisterCustomNode,
  type StoredCustomNode,
} from "../registry/customNodes";

const LEGACY_STORAGE_KEY = "nwave.customNodes.v1";

interface CustomNodeRegistryResponse {
  schemaVersion: number;
  nodes: StoredCustomNode[];
}

export const refreshCustomNodes = async (): Promise<StoredCustomNode[]> => {
  const response = await api.get<CustomNodeRegistryResponse>("/custom-nodes");
  const nodes = Array.isArray(response.data.nodes) ? response.data.nodes : [];
  syncCustomNodes(nodes);
  return nodes;
};

export const persistCustomNode = async (
  node: StoredCustomNode
): Promise<StoredCustomNode> => {
  const response = await api.post<{ node: StoredCustomNode }>("/custom-nodes", {
    node,
  });
  registerCustomNodes([response.data.node]);
  return response.data.node;
};

export const deleteCustomNode = async (nodeId: string): Promise<void> => {
  try {
    await api.delete(`/custom-nodes/${encodeURIComponent(nodeId)}`);
  } catch (error: any) {
    if (error?.response?.status !== 404) {
      throw error;
    }
  }
  unregisterCustomNode(nodeId);
};

export const migrateLegacyCustomNodes = async (): Promise<number> => {
  if (typeof window === "undefined") return 0;

  const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw) return 0;

  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) return 0;

  for (const node of parsed) {
    await persistCustomNode(node);
  }

  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  return parsed.length;
};
