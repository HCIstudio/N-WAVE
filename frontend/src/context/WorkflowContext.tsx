import {
  createContext,
  useContext,
  useState,
  useCallback,
  type FC,
  type PropsWithChildren,
} from "react";
import {
  addEdge,
  applyNodeChanges,
  type Edge,
  type Node,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  type Connection,
  useEdgesState,
  useReactFlow,
} from "reactflow";
import type { NodeData } from "../components/nodes/BaseNode";
import { isNodeDataPatchNoop } from "../utils/nodeData";
import type { ToastType } from "../components/common";
import { validateConnectionWithNodeDefinitions } from "../registry";

interface ToastState {
  message: string;
  type: ToastType;
  key: number;
}

interface IWorkflowContext {
  nodes: Node[];
  edges: Edge[];
  toast: ToastState | null;
  closeToast: () => void;
  isDirty: boolean;
  setIsDirty: React.Dispatch<React.SetStateAction<boolean>>;
  setNodes: React.Dispatch<React.SetStateAction<Node[]>>;
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  onConnectStart: OnConnectStart;
  onConnectEnd: OnConnectEnd;
  isValidConnection: (connection: Connection) => boolean;
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;
  showToast: (message: string, type: ToastType) => void;
}

export const WorkflowContext = createContext<IWorkflowContext | undefined>(
  undefined
);

/**
 * Access the workflow context. Throws if used outside a WorkflowProvider, which
 * lets consumers use the value without null checks or non-null assertions.
 */
export const useWorkflowContext = (): IWorkflowContext => {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error(
      "useWorkflowContext must be used within a WorkflowProvider"
    );
  }
  return context;
};

export const WorkflowProvider: FC<PropsWithChildren> = ({ children }) => {
  const [nodes, setNodes] = useState<Node<NodeData>[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [isDirty, setIsDirty] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isToastVisible, setIsToastVisible] = useState(false);
  const { getNodes, getEdges } = useReactFlow();

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => applyNodeChanges(changes, nds));
      setIsDirty(true);
    },
    []
  );

  const showToast = useCallback(
    (message: string, type: ToastType) => {
      if (isToastVisible) return;
      setToast({ message, type, key: Date.now() });
      setIsToastVisible(true);

      // Auto-dismiss the toast after 5 seconds
      setTimeout(() => {
        setToast(null);
        setIsToastVisible(false);
      }, 10000);
    },
    [isToastVisible]
  );

  const isValidConnection = useCallback(
    (connection: Connection) => {
      const currentNodes = getNodes();
      const currentEdges = getEdges();
      const sourceNode = connection.source
        ? currentNodes.find((node) => node.id === connection.source)
        : undefined;
      const targetNode = connection.target
        ? currentNodes.find((node) => node.id === connection.target)
        : undefined;

      const validation = validateConnectionWithNodeDefinitions({
        connection,
        sourceNode,
        targetNode,
        nodes: currentNodes,
        edges: currentEdges,
      });

      if (!validation.valid) {
        showToast(validation.message || "Invalid connection.", "error");
        return false;
      }

      return true;
    },
    [getNodes, getEdges, showToast]
  );

  const onConnect: OnConnect = useCallback(
    (params) => {
      const targetIncomingCount = params.target
        ? getEdges().filter((edge) => edge.target === params.target).length
        : 0;
      const newEdge = {
        ...params,
        id: `e-${params.source || "N/A"}-${params.target || "N/A"}`,
        type: "default",
        data: {
          order: targetIncomingCount,
          onDelete: (edgeId: string) => {
            setEdges((eds) => eds.filter((e) => e.id !== edgeId));
          },
        },
      };
      setEdges((els) => addEdge(newEdge, els));
      setIsDirty(true);
    },
    [getEdges, setEdges]
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: Partial<NodeData>) => {
      setNodes((currentNodes) => {
        // Returning the same array makes React skip the update, which breaks
        // the write-back loops of nodes that save derived data on every render.
        const targetNode = currentNodes.find((node) => node.id === nodeId);
        if (!targetNode || isNodeDataPatchNoop(targetNode.data, data)) {
          return currentNodes;
        }
        // Mark dirty only for real changes (repeating this is harmless if the
        // updater runs twice in StrictMode).
        setIsDirty(true);

        const updatedNodes = currentNodes.map((node) => {
          if (node.id === nodeId) {
            return { ...node, data: { ...node.data, ...data } };
          }
          return node;
        });

        // Propagate data to connected nodes
        const currentEdges = getEdges();
        const updatedNode = updatedNodes.find((n) => n.id === nodeId);

        if (updatedNode) {
          // Find all edges coming from this node
          const outgoingEdges = currentEdges.filter(
            (edge) => edge.source === nodeId
          );

          // Special handling for zip/html outputs
          if (updatedNode.data.zipOutput || updatedNode.data.htmlOutput) {
            for (const edge of outgoingEdges) {
              const targetNode = updatedNodes.find((n) => n.id === edge.target);
              if (targetNode?.type === "outputDisplay") {
                // Determine which output we're connected to
                let outputData = null;
                if (edge.sourceHandle === "zip" && updatedNode.data.zipOutput) {
                  outputData = {
                    files: [
                      {
                        name: updatedNode.data.zipOutput.fileName,
                        content: updatedNode.data.zipOutput.content,
                        size: updatedNode.data.zipOutput.content.length,
                        fileType: "zip",
                      },
                    ],
                  };
                } else if (
                  edge.sourceHandle === "html" &&
                  updatedNode.data.htmlOutput
                ) {
                  outputData = {
                    files: [
                      {
                        name: updatedNode.data.htmlOutput.fileName,
                        content: updatedNode.data.htmlOutput.content,
                        size: updatedNode.data.htmlOutput.content.length,
                        fileType: "html",
                      },
                    ],
                  };
                }

                if (outputData) {
                  // Update the target node in the array
                  const targetIndex = updatedNodes.findIndex(
                    (n) => n.id === edge.target
                  );
                  if (targetIndex !== -1) {
                    updatedNodes[targetIndex] = {
                      ...updatedNodes[targetIndex],
                      data: {
                        ...updatedNodes[targetIndex].data,
                        ...outputData,
                      },
                    };
                  }
                }
              }
            }
          }

          // Force downstream nodes to refresh when file inputs change
          if (updatedNode.type === "fileInput" && data.files) {
            // Add a timestamp to force re-renders of downstream nodes
            const timestamp = Date.now();

            // Find all downstream nodes (recursively)
            const findDownstreamNodes = (
              sourceId: string,
              visited = new Set<string>()
            ): string[] => {
              if (visited.has(sourceId)) return [];
              visited.add(sourceId);

              const directTargets = currentEdges
                .filter((edge) => edge.source === sourceId)
                .map((edge) => edge.target);

              const allDownstream = [...directTargets];
              for (const target of directTargets) {
                allDownstream.push(...findDownstreamNodes(target, visited));
              }

              return allDownstream;
            };

            const downstreamNodeIds = findDownstreamNodes(nodeId);

            // Update all downstream nodes with a refresh timestamp
            for (const downstreamId of downstreamNodeIds) {
              const nodeIndex = updatedNodes.findIndex(
                (n) => n.id === downstreamId
              );
              if (nodeIndex !== -1) {
                updatedNodes[nodeIndex] = {
                  ...updatedNodes[nodeIndex],
                  data: {
                    ...updatedNodes[nodeIndex].data,
                    _refreshTimestamp: timestamp,
                  },
                };
              }
            }
          }
        }

        return updatedNodes;
      });
    },
    [getEdges]
  );

  const onConnectStart: OnConnectStart = () => {
    // This logic can be simplified or removed if not causing issues,
    // as isValidConnection now handles the primary validation.
  };

  const onConnectEnd = () => {
    // This logic can also be reviewed.
  };

  const closeToast = () => {
    setToast(null);
    setIsToastVisible(false);
  };

  const value: IWorkflowContext = {
    nodes,
    edges,
    toast,
    closeToast,
    isDirty,
    setIsDirty,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onConnectStart,
    onConnectEnd,
    isValidConnection,
    updateNodeData,
    showToast,
  };

  return (
    <WorkflowContext.Provider value={value}>
      {children}
    </WorkflowContext.Provider>
  );
};
