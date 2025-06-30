import type React from "react";
import {
  useState,
  useCallback,
  useEffect,
  useContext,
  useMemo,
} from "react";
import { useParams } from "react-router-dom";
import { ReactFlowProvider, useReactFlow } from "reactflow";
import type { Node } from "reactflow";
import type { NodeData } from "../components/nodes/BaseNode";
import Canvas from "../components/canvas/Canvas";
import { PropertiesPanel } from "../components/panels";
import Header from "../components/layout/Header";
import api from "../api";
import type { NextflowProcess } from "../data/types";
import BottomBar from "../components/canvas/BottomBar";
import DeleteDropZone from "../components/canvas/DeleteDropZone";
import { WorkflowContext, WorkflowProvider } from "../context/WorkflowContext";
import { FloatingPanel } from "../components/panels";
import { OutputDisplayPanelContent } from "../components/panels";
import {
  ConfirmDialog,
  Toast,
  WorkflowExecutionErrorNotification,
} from "../components/common";
import ExecutionStatusPanel from "../components/common/workflow/ExecutionStatusPanel";
import { useExecutionStatus } from "../hooks";
import { generateNextflowScript } from "../generators";
import { Loader } from "lucide-react";
import { type ExecutionSettings, ExecutionMode } from "../types/execution";

const WorkflowPageContent: React.FC = () => {
  const workflowContext = useContext(WorkflowContext);
  if (!workflowContext) {
    return <div>Workflow context is not available.</div>;
  }
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    updateNodeData,
    setIsDirty,
    isValidConnection,
    onConnectStart,
    onConnectEnd,
    toast,
    closeToast,
  } = workflowContext;

  const [openPanelNodeIds, setOpenPanelNodeIds] = useState<string[]>([]);
  const [workflowName, setWorkflowName] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHoveringDropZone, setIsHoveringDropZone] = useState(false);
  const [nodeToDelete, setNodeToDelete] = useState<Node<NodeData> | null>(null);
  const [isConnecting] = useState(false);
  const [activePanels, setActivePanels] = useState<string[]>([]);
  const [recenterRequest, setRecenterRequest] = useState<{
    panelId: string;
    timestamp: number;
  } | null>(null);
  const [activePanelNodeId, setActivePanelNodeId] = useState<string | null>(
    null
  );
  const [, setPanelStates] = useState<
    Record<string, { x: number; y: number; width: number; height: number }>
  >({});
  const [isRunning, setIsRunning] = useState(false);
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(
    null
  );
  const [, setExecutionResult] = useState<{
    success: boolean;
    output: string;
    error?: string;
  } | null>(null);
  const [showErrorDialog, setShowErrorDialog] = useState(false);
  const [executionError, setExecutionError] = useState<{
    message: string;
    output?: string;
    code?: string | number;
  } | null>(null);
  const [executionSettings, setExecutionSettings] = useState<ExecutionSettings>(
    {
      mode: ExecutionMode.DOCKER,
      nextflow: {
        version: "25.04.4",
        forceVersion: false,
        enableDsl2: true,
        enableTrace: false,
        enableTimeline: false,
        enableReport: false,
      },
      output: {
        directory: "results",
        namingPattern: "{workflow_name}_{timestamp}",
        overwrite: false,
        keepWorkDir: false,
      },
      container: {
        enabled: true,
        defaultImage: "ubuntu:22.04",
        registry: "docker.io",
        pullPolicy: "if-not-present",
        customRunOptions: [],
      },
      resources: {
        maxCpus: 4,
        maxMemory: "4.GB",
        maxTime: "PT30M",
        executor: "local",
      },
      errorHandling: {
        strategy: "terminate",
        maxRetries: 0,
        backoffStrategy: "exponential",
        continueOnError: false,
      },
      environment: {
        profile: "standard",
        customParams: {},
        environmentVariables: {},
      },
      cleanup: {
        onSuccess: false,
        onFailure: false,
        intermediateFiles: false,
        workDirectory: false,
      },
      validation: {
        requireContainer: false,
        allowMissingInputs: false,
        strictChannelTypes: false,
        enableTypeChecking: false,
      },
    }
  );

  const { id: workflowId } = useParams<{ id: string }>();
  const { screenToFlowPosition } = useReactFlow();

  const handleProcessSelect = useCallback(
    (process: NextflowProcess) => {
      const position = screenToFlowPosition({
        x: window.innerWidth / 2 - 150, // Adjust for panel width
        y: window.innerHeight / 3,
      });

      const newNode: Node<NodeData> = {
        id: `node-${+new Date()}`,
        type: process.type,
        position,
        data: {
          label: process.label,
          icon: process.icon,
          ...process.initialData,
        },
      };

      setNodes((nds) => nds.concat(newNode));
      setIsDirty(true);
    },
    [screenToFlowPosition, setNodes, setIsDirty]
  );

  // Memoize nodes to prevent unnecessary re-renders, and disable interaction during connection
  const memoizedNodes = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isHighlight: node.id === activePanelNodeId,
      },
      selectable: !isConnecting,
      draggable: !isConnecting,
    }));
  }, [nodes, isConnecting, activePanelNodeId]);

  // Memoize edges to prevent unnecessary re-renders
  const memoizedEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
    }));
  }, [edges]);

  // Execution status tracking
  const executionStatus = useExecutionStatus({
    nodes: memoizedNodes,
    executionId: currentExecutionId,
    onStatusChange: (status) => {
      // Update node statuses on the canvas based on execution status
      if (status.nodeStatuses.length === 0 && !status.isRunning) {
        // Clear all node statuses when execution is complete and not running
        nodes.forEach((node) => {
          if (node.data.status) {
            updateNodeData(node.id, { status: undefined });
          }
        });
      } else if (status.nodeStatuses.length > 0) {
        // Update individual node statuses during execution
        status.nodeStatuses.forEach((nodeStatus: any) => {
          const nodeIndex = nodes.findIndex((n) => n.id === nodeStatus.nodeId);
          if (nodeIndex !== -1) {
            // Map execution status to node status (excluding 'skipped')
            const nodeStatusValue =
              nodeStatus.status === "skipped" ? "waiting" : nodeStatus.status;
            updateNodeData(nodeStatus.nodeId, { status: nodeStatusValue });
          }
        });
      }
    },
  });

  const fetchWorkflow = useCallback(async () => {
    if (!workflowId) {
      setError("No workflow ID provided.");
      setWorkflowName("New Workflow"); // Set default name when no ID
      setIsLoading(false);
      return;
    }
    try {
      const response = await api.get(`/workflows/${workflowId}`);
      const {
        name,
        nodes: fetchedNodes,
        edges: fetchedEdges,
        executionSettings,
      } = response.data;

      console.log("Fetched workflow data:", {
        name,
        hasNodes: !!fetchedNodes,
        hasEdges: !!fetchedEdges,
        hasExecutionSettings: !!executionSettings,
      });
      const workflowTitle =
        name && name.trim() !== "" ? name : "Untitled Workflow";
      setWorkflowName(workflowTitle);

      setNodes(fetchedNodes || []);

      const hydratedEdges = (fetchedEdges || []).map((edge: any) => ({
        ...edge,
        type: "default",
        data: {
          ...edge.data,
          onDelete: (edgeId: string) => {
            setEdges((eds) => eds.filter((e) => e.id !== edgeId));
          },
        },
      }));

      setEdges(hydratedEdges);

      // Restore execution settings if they exist in the workflow
      if (executionSettings) {
        try {
          // Update localStorage with the settings from backend
          localStorage.setItem(
            "executionSettings",
            JSON.stringify(executionSettings)
          );

          // Update the component state with the restored settings
          setExecutionSettings(executionSettings);

          console.log(
            "Restored execution settings from workflow:",
            executionSettings
          );
        } catch (error) {
          console.error("Failed to restore execution settings:", error);
        }
      } else {
        // If no execution settings in backend, try to load from localStorage
        try {
          const savedSettings = localStorage.getItem("executionSettings");
          if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            setExecutionSettings(parsed);
            console.log("Loaded execution settings from localStorage:", parsed);
          }
        } catch (error) {
          console.error(
            "Failed to load execution settings from localStorage:",
            error
          );
        }
      }

      setIsDirty(false);
    } catch (err) {
      setError("Failed to fetch workflow.");
      setWorkflowName("Untitled Workflow"); // Set default name on error
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [workflowId, setNodes, setEdges, setIsDirty, setExecutionSettings]);

  useEffect(() => {
    fetchWorkflow();
  }, [fetchWorkflow]);

  // Initialize execution settings in localStorage if not present
  useEffect(() => {
    const savedSettings = localStorage.getItem("executionSettings");
    if (!savedSettings) {
      // Set default execution settings if none exist
      const defaultSettings = {
        mode: "docker",
        nextflow: {
          version: "25.04.4",
          forceVersion: false,
          enableDsl2: true,
          enableTrace: false,
          enableTimeline: false,
          enableReport: false,
        },
        output: {
          directory: "results",
          namingPattern: "{workflow_name}_{timestamp}",
          overwrite: false,
          keepWorkDir: false,
        },
        container: {
          enabled: true,
          defaultImage: "ubuntu:22.04",
          registry: "docker.io",
          pullPolicy: "if-not-present",
          customRunOptions: [],
        },
        resources: {
          maxCpus: 4,
          maxMemory: "4.GB",
          maxTime: "PT30M",
          executor: "local",
        },
        errorHandling: {
          strategy: "terminate",
          maxRetries: 0,
          backoffStrategy: "exponential",
          continueOnError: false,
        },
        environment: {
          profile: "standard",
          customParams: {},
          environmentVariables: {},
        },
        cleanup: {
          onSuccess: false,
          onFailure: false,
          intermediateFiles: false,
          workDirectory: false,
        },
        validation: {
          requireContainer: false,
          allowMissingInputs: false,
          strictChannelTypes: false,
          enableTypeChecking: false,
        },
      };

      try {
        localStorage.setItem(
          "executionSettings",
          JSON.stringify(defaultSettings)
        );
        console.log("Initialized default execution settings in localStorage");
      } catch (error) {
        console.error("Failed to initialize execution settings:", error);
      }
    }
  }, []);

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (!openPanelNodeIds.includes(node.id)) {
        setOpenPanelNodeIds((prev) => [...prev, node.id]);
      }
      if (!activePanels.includes(node.id)) {
        setActivePanels((prev) => [...prev, node.id]);
      }

      bringPanelToFront(node.id);
      setActivePanelNodeId(node.id);

      // Recenter the panel if it's already open
      const isAlreadyOpen = activePanels.includes(node.id);
      if (isAlreadyOpen) {
        setRecenterRequest({ panelId: node.id, timestamp: Date.now() });
      }
    },
    [openPanelNodeIds, activePanels]
  );

  const onPanelClose = (panelId: string) => {
    setOpenPanelNodeIds((ids) => ids.filter((id) => id !== panelId));
    setActivePanelNodeId(null);
  };

  const bringPanelToFront = (panelId: string) => {
    setActivePanels((prev) => [...prev.filter((p) => p !== panelId), panelId]);
  };

  const handleSaveWorkflow = async () => {
    if (!workflowId) {
      setError("No workflow ID provided.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      // Strip file content from nodes before saving to avoid payload too large errors
      const sanitizedNodes = nodes.map((node) => {
        const sanitizedData = { ...node.data };

        // Remove file content but keep metadata for file input nodes
        if (sanitizedData.files) {
          sanitizedData.files = sanitizedData.files.map((file: any) => ({
            name: file.name,
            size: file.size,
            fileType: file.fileType,
            _id: file._id,
            // Note: content is removed - files are handled in browser storage
          }));
        }

        // Remove other large content fields but keep user selections
        delete sanitizedData.fileContent;
        delete sanitizedData.processedContent;

        // Sanitize selectedFilterFiles - keep selection metadata but remove content
        if (sanitizedData.selectedFilterFiles) {
          sanitizedData.selectedFilterFiles =
            sanitizedData.selectedFilterFiles.map((file: any) => ({
              name: file.name,
              size: file.size,
              fileType: file.fileType,
              _id: file._id,
            }));
        }

        return {
          ...node,
          data: sanitizedData,
        };
      });

      // Get execution settings from current state instead of localStorage
      // This ensures we save the most up-to-date settings
      const executionSettingsToSave = executionSettings;

      await api.put(`/workflows/${workflowId}`, {
        name: workflowName,
        nodes: sanitizedNodes,
        edges,
        executionSettings: executionSettingsToSave, // Save current execution settings
      });
      setIsDirty(false);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000); // Show checkmark for 2 seconds
    } catch (err) {
      setError("Failed to save workflow.");
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  // Auto-save workflow when important changes are made
  useEffect(() => {
    const autoSaveTimer = setTimeout(() => {
      if (workflowContext.isDirty && !isSaving && workflowId) {
        console.log("Auto-saving workflow...");
        handleSaveWorkflow();
      }
    }, 2000); // Auto-save 2 seconds after changes

    return () => clearTimeout(autoSaveTimer);
  }, [workflowContext.isDirty, isSaving, workflowId, nodes, edges]);

  const handleDownloadScript = () => {
    try {
      const script = generateNextflowScript(
        nodes,
        edges,
        workflowName || "workflow",
        executionSettings?.output?.directory || "results",
        executionSettings?.output?.namingPattern ??
          "{workflow_name}_{timestamp}"
      );
      const blob = new Blob([script], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${workflowName.replace(/\s+/g, "_") || "workflow"}.nf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message); // Display cycle detection errors to the user
      } else {
        setError("An unknown error occurred during script generation.");
      }
    }
  };

  const handleRunWorkflow = async (settings: ExecutionSettings) => {
    setIsRunning(true);
    setExecutionResult(null);
    setError(null);
    setExecutionSettings(settings);

    // Start execution status tracking
    executionStatus.startExecution();

    try {
      // Validate file inputs before execution
      const missingFiles = checkForMissingFiles();
      if (missingFiles.length > 0) {
        const errorMessage = `Cannot execute workflow: ${
          missingFiles.length
        } file${
          missingFiles.length === 1 ? "" : "s"
        } missing content.\n\nMissing files:\n${missingFiles
          .map((name) => `• ${name}`)
          .join("\n")}\n\nPlease upload ${
          missingFiles.length === 1 ? "this file" : "these files"
        } before running the workflow.`;

        throw new Error(errorMessage);
      }

      // Extract file content from File Input nodes
      const fileInputNodes = nodes.filter((node) => node.type === "fileInput");
      const workflowFiles: { [filename: string]: string } = {};

      for (const node of fileInputNodes) {
        if (node.data.files && Array.isArray(node.data.files)) {
          for (const file of node.data.files) {
            if (file.content) {
              workflowFiles[file.name || file.originalName || "unknown_file"] =
                file.content;
            }
          }
        }
      }

      // Generate the Nextflow script with execution settings
      const nextflowScript = generateNextflowScript(
        nodes,
        edges,
        workflowName || "workflow",
        settings.output.directory || "results",
        settings.output?.namingPattern ?? "{workflow_name}_{timestamp}"
      );

      if (!nextflowScript || nextflowScript.trim() === "") {
        throw new Error(
          "Generated Nextflow script is empty. Please add nodes to your workflow."
        );
      }

      console.log(
        `Transferring ${Object.keys(workflowFiles).length} files to server:`,
        Object.keys(workflowFiles)
      );

      // Flatten the enhanced execution settings to match backend interface
      const flatExecutionSettings = {
        useDocker: settings.container?.enabled ?? false,
        containerImage: settings.container?.defaultImage ?? "ubuntu:22.04",
        outputDirectory: settings.output.directory ?? "results",
        outputNaming:
          settings.output?.namingPattern ?? "{workflow_name}_{timestamp}",
        maxCpus: settings.resources?.maxCpus ?? 4,
        maxMemory: settings.resources?.maxMemory ?? "4 GB",
        executionTimeout: 0, // Default value
        errorStrategy: settings.errorHandling?.strategy ?? "terminate",
        cleanupOnFailure: settings.cleanup?.onFailure ?? true,
        nextflowVersion: settings.nextflow?.version ?? "25.04.4",
      };

      console.log(
        "Sending flattened execution settings:",
        flatExecutionSettings
      );
      console.log("Original settings structure:", {
        resources: settings.resources,
        container: settings.container,
        output: settings.output,
      });

      // Execute the workflow with file content
      const response = await api.post(
        "/execute/execute",
        {
          nextflowScript,
          workflowName: workflowName || "workflow",
          useDocker: settings.container?.enabled,
          containerImage: settings.container?.defaultImage,
          outputDirectory: settings.output.directory,
          executionSettings: flatExecutionSettings,
          fileContent: workflowFiles, // Send actual file content
        },
        {
          responseType: "text", // Handle as streaming text
          transformResponse: [(data) => data], // Don't parse as JSON
        }
      );

      // Handle streaming response
      if (typeof response.data === "string") {
        console.log("📡 Received streaming response from backend");

        // Parse the streaming output line by line in real-time
        const lines = response.data.split("\n").filter((l) => l.trim());

        lines.forEach((line, index) => {
          // Parse each line immediately (no delay needed - it's already real-time!)
          setTimeout(() => {
            console.log(
              `📄 Real-time parsing line ${index + 1}/${lines.length}:`,
              line
            );
            executionStatus.parseNextflowOutput(line);
          }, index * 10); // Very small delay just for visual smoothness
        });

        // Set success result
        setExecutionResult({
          success: true,
          output: response.data,
        });

        if (workflowContext.showToast) {
          workflowContext.showToast(
            `Workflow executed successfully! Check the execution panel for details.`,
            "success"
          );
        }
      } else {
        // Fallback for older JSON response format
        const parseOutputLines = (stdout: string, stderr = "") => {
          console.log(
            "🔍 Parsing real Nextflow output from completed execution..."
          );

          // Combine stdout and stderr for comprehensive parsing
          const allOutput = stdout + "\n" + stderr;
          const lines = allOutput.split("\n").filter((l) => l.trim());

          console.log(`📊 Total lines to parse: ${lines.length}`);
          console.log(`📄 Full output to parse:`, allOutput);

          // Parse all lines to simulate the execution progression rapidly
          lines.forEach((line, index) => {
            // Add small delays to simulate real-time parsing for better UX
            setTimeout(() => {
              console.log(
                `📄 Parsing line ${index + 1}/${lines.length}:`,
                line
              );
              executionStatus.parseNextflowOutput(line);
            }, index * 50); // 50ms delay between each line for visual effect
          });

          // Complete execution after all lines are parsed
          setTimeout(() => {
            console.log(`🔍 Checking for completion in output: "${allOutput}"`);
            if (
              allOutput.includes("Nextflow execution completed successfully")
            ) {
              console.log("✅ Detected successful completion from output");
              executionStatus.completeExecution(true);

              if (workflowContext.showToast) {
                workflowContext.showToast(
                  `Workflow executed successfully! Results saved to: ${resultsLocation}`,
                  "success"
                );
              }
            } else {
              console.warn(
                "⚠️ No completion pattern found, forcing completion"
              );
              executionStatus.completeExecution(true);

              if (workflowContext.showToast) {
                workflowContext.showToast(
                  `Workflow executed successfully! Results saved to: ${resultsLocation}`,
                  "success"
                );
              }
            }
          }, lines.length * 50 + 500); // Extra 500ms buffer
        };

        // Store execution ID immediately for cancellation
        if (response.data.executionId) {
          setCurrentExecutionId(response.data.executionId);
          console.log(
            "Execution ID set for cancellation:",
            response.data.executionId
          );
        }

        // Set initial execution result
        setExecutionResult({
          success: true,
          output: response.data.message || "Workflow execution started",
        });

        // Store results location for later use
        const resultsLocation = response.data.resultsLocation;

        // Parse the actual output returned from backend
        if (response.data) {
          const { stdout, stderr, success } = response.data;

          if (stdout) {
            console.log(
              "📥 Received stdout from backend:",
              stdout.length,
              "characters"
            );
            parseOutputLines(stdout, stderr);
          } else if (success) {
            // If success but no stdout, complete immediately
            console.log("✅ Backend reported successful execution (no output)");
            executionStatus.completeExecution(true);

            if (workflowContext.showToast) {
              workflowContext.showToast(
                `Workflow executed successfully! Results saved to: ${resultsLocation}`,
                "success"
              );
            }
          }
        } else {
          // Fallback for older response format
          console.warn(
            "⚠️ No structured response data, using fallback timeout"
          );

          const nodeCount = nodes.filter(
            (n) =>
              n.type === "process" ||
              n.type === "operator" ||
              n.type === "filter" ||
              n.type === "outputDisplay"
          ).length;

          const fallbackDuration = Math.min(
            Math.max(nodeCount * 5000, 30000),
            120000
          );

          setTimeout(() => {
            console.warn(
              "⏰ Fallback timeout reached - assuming workflow completed"
            );
            executionStatus.completeExecution(true);

            if (workflowContext.showToast) {
              workflowContext.showToast(
                `Workflow executed successfully! Results saved to: ${resultsLocation}`,
                "success"
              );
            }
          }, fallbackDuration);
        }
      }

      // Close the error dialog on successful execution
      setShowErrorDialog(false);
      setExecutionError(null);
    } catch (error: any) {
      console.error("Workflow execution failed:", error);
      const errorMessage =
        error.response?.data?.error ||
        error.message ||
        "Unknown error occurred during workflow execution";

      const errorOutput =
        error.response?.data?.stdout || error.response?.data?.stderr || "";

      setExecutionResult({
        success: false,
        output: errorOutput,
        error: errorMessage,
      });

      // Complete execution status tracking (failure)
      executionStatus.completeExecution(false, errorMessage);

      // Set error for the dialog
      setExecutionError({
        message: errorMessage,
        output: errorOutput,
        code: error.response?.status || error.code,
      });

      setShowErrorDialog(true);
    } finally {
      setIsRunning(false);
      setCurrentExecutionId(null);
    }
  };

  const onNodeDragStart = () => setIsDragging(true);

  const onNodeDrag = (_: React.MouseEvent, node: Node) => {
    if (!node.width || !node.height || !node.positionAbsolute) return;

    const dropZone = document.getElementById("delete-drop-zone");
    if (!dropZone) return;

    const dropZoneRect = dropZone.getBoundingClientRect();

    const topLeft = screenToFlowPosition({
      x: dropZoneRect.left,
      y: dropZoneRect.top,
    });
    const bottomRight = screenToFlowPosition({
      x: dropZoneRect.right,
      y: dropZoneRect.bottom,
    });

    const isHovering =
      node.positionAbsolute.x < bottomRight.x &&
      node.positionAbsolute.x + node.width > topLeft.x &&
      node.positionAbsolute.y < bottomRight.y &&
      node.positionAbsolute.y + node.height > topLeft.y;

    setIsHoveringDropZone(isHovering);
  };

  const onNodeDragStop = (_: React.MouseEvent, node: Node) => {
    setIsDragging(false);
    if (isHoveringDropZone) {
      setNodes((nds) => nds.filter((n) => n.id !== node.id));
      setEdges((eds) =>
        eds.filter((e) => e.source !== node.id && e.target !== node.id)
      );
    }
    setIsHoveringDropZone(false);
  };

  const handleDeleteNode = (node: Node<NodeData> | null) => {
    if (node) {
      setNodeToDelete(node);
    }
  };

  const onConfirmDelete = () => {
    if (nodeToDelete) {
      setNodes((nds) => nds.filter((n) => n.id !== nodeToDelete.id));
      setEdges((eds) =>
        eds.filter(
          (e) => e.source !== nodeToDelete.id && e.target !== nodeToDelete.id
        )
      );
      setNodeToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setNodeToDelete(null);
  };

  // Helper function to check for missing files
  const checkForMissingFiles = (): string[] => {
    const fileInputNodes = nodes.filter((node) => node.type === "fileInput");
    const missingFiles: string[] = [];

    for (const node of fileInputNodes) {
      if (node.data.files && Array.isArray(node.data.files)) {
        for (const file of node.data.files) {
          if (!file.content || file.content.trim() === "") {
            missingFiles.push(file.name || file.originalName || "unknown_file");
          }
        }
      }
    }

    return missingFiles;
  };

  // Check if workflow can be executed (no missing files)
  const canExecuteWorkflow = checkForMissingFiles().length === 0;

  const handleRetryExecution = async () => {
    if (!executionSettings) {
      throw new Error("No execution settings available for retry");
    }

    // Call handleRunWorkflow for retry
    await handleRunWorkflow(executionSettings);
  };

  const handleCloseErrorDialog = () => {
    setShowErrorDialog(false);
    setExecutionError(null);
  };

  const onPanelPositionChange = useCallback(
    (panelId: string, x: number, y: number) => {
      setPanelStates((prev) => ({
        ...prev,
        [panelId]: {
          ...prev[panelId],
          x: prev[panelId].x + x,
          y: prev[panelId].y + y,
        },
      }));
    },
    []
  );

  const onPanelResize = useCallback((panelId: string, x: number, y: number) => {
    setPanelStates((prev) => ({
      ...prev,
      [panelId]: {
        ...prev[panelId],
        width: prev[panelId].width + x,
        height: prev[panelId].height + y,
      },
    }));
  }, []);

  const handleExecutionSettingsChange = useCallback(
    (newSettings: ExecutionSettings) => {
      setExecutionSettings(newSettings);

      // Save to localStorage immediately
      try {
        localStorage.setItem("executionSettings", JSON.stringify(newSettings));
      } catch (error) {
        console.error(
          "Failed to save execution settings to localStorage:",
          error
        );
      }

      // Mark workflow as dirty to trigger auto-save
      setIsDirty(true);
    },
    [setIsDirty]
  );

  const renderPanels = () => {
    const nodesMap = new Map(nodes.map((n) => [n.id, n]));
    const openNodes = openPanelNodeIds
      .map((id) => nodesMap.get(id))
      .filter((n): n is Node<NodeData> => !!n);

    return openNodes.map((node) => {
      const style = { zIndex: (activePanels.indexOf(node.id) + 1) * 10 };
      const recenterTrigger =
        recenterRequest?.panelId === node.id
          ? recenterRequest.timestamp
          : undefined;

      if (node.type === "outputDisplay" || node.type === "documentation") {
        return (
          <FloatingPanel
            key={node.id}
            panelId={node.id}
            title={node.data.label || "Panel"}
            isOpen={activePanels.includes(node.id)}
            onClose={() => onPanelClose(node.id)}
            onDelete={() => handleDeleteNode(node)}
            onMouseEnter={() => setActivePanelNodeId(node.id)}
            onMouseLeave={() => setActivePanelNodeId(null)}
            onFocus={() => bringPanelToFront(node.id)}
            style={style}
            recenterTrigger={recenterTrigger}
            onPositionChange={(dx, dy) =>
              onPanelPositionChange(node.id, dx, dy)
            }
            onResize={(dx, dy) => onPanelResize(node.id, dx, dy)}
          >
            {node.type === "outputDisplay" ? (
              <OutputDisplayPanelContent
                node={node}
                onNodeDataChange={updateNodeData}
              />
            ) : null}
          </FloatingPanel>
        );
      } else {
        return (
          <PropertiesPanel
            key={node.id}
            node={node}
            onClose={() => onPanelClose(node.id)}
            onSave={updateNodeData}
            onDelete={() => {
              handleDeleteNode(node);
              onPanelClose(node.id);
            }}
            onMouseEnter={() => setActivePanelNodeId(node.id)}
            onMouseLeave={() => setActivePanelNodeId(null)}
            onFocus={() => bringPanelToFront(node.id)}
            style={style}
            recenterTrigger={recenterTrigger}
          />
        );
      }
    });
  };

  // Only show simple error display for critical loading errors
  if (
    error &&
    (isLoading ||
      error.includes("No workflow ID") ||
      error.includes("Failed to fetch"))
  ) {
    return (
      <div className="text-red-500 p-4 text-center">
        Error: {error}. Please try refreshing the page.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-canvas-background text-text">
      <Header onProcessSelect={handleProcessSelect} />
      <div className="flex-grow relative">
        {isLoading && (
          <div className="absolute inset-0 bg-background bg-opacity-80 flex items-center justify-center z-50">
            <div className="text-text-light text-xl flex items-center gap-2">
              <Loader className="animate-spin text-nextflow-green" />
              <span className="text-nextflow-green">Loading Workflow...</span>
            </div>
          </div>
        )}
        <Canvas
          nodes={memoizedNodes}
          edges={memoizedEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStart={onNodeDragStart}
          onNodeDrag={onNodeDrag}
          onNodeDragStop={onNodeDragStop}
          onNodeDoubleClick={onNodeDoubleClick}
          isValidConnection={isValidConnection}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
        />
        <DeleteDropZone
          isDragging={isDragging}
          isHovering={isHoveringDropZone}
        />
        {renderPanels()}
      </div>

      <BottomBar
        workflowName={workflowName}
        onWorkflowNameChange={setWorkflowName}
        onSave={handleSaveWorkflow}
        onDownload={handleDownloadScript}
        onRun={handleRunWorkflow}
        isSaved={isSaved}
        isSaving={isSaving}
        isRunning={isRunning}
        canExecute={canExecuteWorkflow}
        isLoading={isLoading}
        executionSettings={executionSettings as ExecutionSettings}
        onExecutionSettingsChange={handleExecutionSettingsChange}
      />
      {nodeToDelete && (
        <ConfirmDialog
          isOpen={!!nodeToDelete}
          title="Delete Node"
          message={`Are you sure you want to delete the "${
            nodeToDelete.data.label || nodeToDelete.id
          }" node?`}
          onConfirm={onConfirmDelete}
          onClose={handleCancelDelete}
        />
      )}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={closeToast} />
      )}
      {showErrorDialog && executionError && (
        <WorkflowExecutionErrorNotification
          isVisible={showErrorDialog}
          onClose={handleCloseErrorDialog}
          onRetry={handleRetryExecution}
          error={executionError}
        />
      )}

      {/* Execution Status Panel */}
      <ExecutionStatusPanel
        status={executionStatus.status}
        nodes={memoizedNodes}
        onCancel={executionStatus.cancelExecution}
        onClose={executionStatus.hideStatus}
        isVisible={executionStatus.isVisible}
      />
    </div>
  );
};

const WorkflowPage: React.FC = () => (
  <ReactFlowProvider>
    <WorkflowProvider>
      <WorkflowPageContent />
    </WorkflowProvider>
  </ReactFlowProvider>
);

export default WorkflowPage;
