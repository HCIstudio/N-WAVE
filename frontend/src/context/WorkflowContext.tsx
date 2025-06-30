import {
  createContext,
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
  type Connection,
  useEdgesState,
  useReactFlow,
} from "reactflow";
import type { NodeData } from "../components/nodes/BaseNode";
import type { ToastType } from "../components/common";

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
  onConnectStart: (event: React.MouseEvent, params: any) => void;
  onConnectEnd: () => void;
  isValidConnection: (connection: Connection) => boolean;
  updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;
  showToast: (message: string, type: ToastType) => void;
}

export const WorkflowContext = createContext<IWorkflowContext | undefined>(
  undefined
);

export const WorkflowProvider: FC<PropsWithChildren<{}>> = ({ children }) => {
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
    [setNodes]
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

      if (connection.target) {
        const targetNode = currentNodes.find(
          (node) => node.id === connection.target
        );
        if (targetNode?.type === "outputDisplay") {
          const existingEdges = currentEdges.filter(
            (edge) => edge.target === connection.target
          );
          if (existingEdges.length > 0) {
            showToast("Display Output can only take one input.", "error");
            return false;
          }
        }

        // Prevent connecting FastQC outputs to Trimmomatic
        if (
          targetNode?.data?.processType === "trimmomatic" &&
          connection.source
        ) {
          const sourceNode = currentNodes.find(
            (node) => node.id === connection.source
          );
          if (sourceNode?.data?.processType === "fastqc") {
            showToast(
              "Cannot connect FastQC to Trimmomatic. FastQC produces quality reports (ZIP/HTML), not FASTQ files. Connect both to the same File Input instead.",
              "error"
            );
            return false;
          }
        }
      }

      if (connection.source) {
        const sourceNode = currentNodes.find(
          (node) => node.id === connection.source
        );
        if (
          sourceNode?.type === "fileInput" &&
          (!sourceNode.data.files || sourceNode.data.files.length === 0)
        ) {
          showToast(
            "File Input requires at least one file before connecting.",
            "error"
          );
          return false;
        }
      }

      return true;
    },
    [getNodes, getEdges, showToast]
  );

  const onConnect: OnConnect = useCallback(
    (params) => {
      const newEdge = {
        ...params,
        id: `e-${params.source || "N/A"}-${params.target || "N/A"}`,
        type: "default",
        data: {
          onDelete: (edgeId: string) => {
            setEdges((eds) => eds.filter((e) => e.id !== edgeId));
          },
        },
      };
      setEdges((els) => addEdge(newEdge, els));
      setIsDirty(true);
    },
    [setEdges]
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: Partial<NodeData>) => {
      setNodes((currentNodes) => {
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
            outgoingEdges.forEach((edge) => {
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
            });
          }

          // Force downstream nodes to refresh when file inputs change
          if (updatedNode.type === "fileInput" && data.files) {
            if (process.env.NODE_ENV === "development") {
              console.log(
                "🔄 File input changed, triggering downstream updates"
              );
            }

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
              directTargets.forEach((target) => {
                allDownstream.push(...findDownstreamNodes(target, visited));
              });

              return allDownstream;
            };

            const downstreamNodeIds = findDownstreamNodes(nodeId);

            // Update all downstream nodes with a refresh timestamp
            downstreamNodeIds.forEach((downstreamId) => {
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

                if (process.env.NODE_ENV === "development") {
                  console.log(
                    "⬇️ Triggered refresh for downstream node:",
                    downstreamId
                  );
                }
              }
            });
          }
        }

        return updatedNodes;
      });
      setIsDirty(true);
    },
    [setNodes, getEdges]
  );

  const onConnectStart = (_: React.MouseEvent, {}: any) => {
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
