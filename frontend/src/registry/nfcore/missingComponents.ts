import type { Node } from "reactflow";
import type { NodeData } from "../../components/nodes/BaseNode";
import { getNodeDefinitionForNode } from "../nodeDefinitions";

/**
 * The nf-core modules and subworkflows (install ids such as
 * "nf-core/fastqc") that nodes on the canvas use but that aren't installed:
 * those nodes generate no code until they are.
 */
export const getMissingNfCoreComponents = (nodes: Node<NodeData>[]): string[] =>
  Array.from(
    new Set(
      nodes.flatMap((node) => {
        const id = node.data?.nwaveNfCoreModuleId;
        return typeof id === "string" && !getNodeDefinitionForNode(node)
          ? [id]
          : [];
      }),
    ),
  ).sort();
