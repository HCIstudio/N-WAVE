import React, { type FC, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  ConnectionMode,
  useNodesInitialized,
  useReactFlow,
} from "@xyflow/react";
import type {
  Edge,
  Node,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  OnConnectEnd,
  OnConnectStart,
  IsValidConnection,
  OnNodeDrag,
} from "@xyflow/react";

import CustomControls, { type HistoryControls } from "./CustomControls";
import CanvasMinimap from "./CanvasMinimap";
import { logActivity } from "../../activity/activityLog";
import CustomEdge from "./CustomEdge";
import BaseNode from "../nodes/BaseNode";
import NoteNode from "../nodes/note/NoteNode";
import FileInputNode from "../nodes/input/FileInputNode";
import OutputDisplayNode from "../nodes/output/OutputDisplayNode";
import OperatorNode from "../nodes/OperatorNode";
import ProcessNode from "../nodes/process/ProcessNode";

const nodeTypes = {
  default: BaseNode,
  fileInput: FileInputNode,
  samplesheet: BaseNode,
  parameters: BaseNode,
  channelOperator: BaseNode,
  pipeline: BaseNode,
  note: NoteNode,
  outputDisplay: OutputDisplayNode,
  filter: OperatorNode,
  operator: OperatorNode,
  process: ProcessNode,
};

const edgeTypes = {
  default: CustomEdge,
  custom: CustomEdge,
};

interface CanvasProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: OnConnect;
  isValidConnection: IsValidConnection;
  onNodeDoubleClick: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStart: OnNodeDrag;
  onNodeDrag: OnNodeDrag;
  onNodeDragStop: OnNodeDrag;
  onConnectStart: OnConnectStart;
  onConnectEnd: OnConnectEnd;
  /** Undo and redo buttons in the control bar. */
  history?: HistoryControls;
  /** Opens the keyboard shortcuts overview. */
  onShowShortcuts?: () => void;
  /** Zooms to the step that failed in the last run; none: nothing failed. */
  onZoomToFailed?: () => void;
}

const MINIMAP_KEY = "nwave-canvas-minimap";
const readMinimap = (): boolean => {
  try {
    return localStorage.getItem(MINIMAP_KEY) === "on";
  } catch {
    return false;
  }
};

/**
 * Fits the view once the canvas's first nodes all have their size. React
 * Flow's own `fitView` fits on its first measurement, which can come before
 * all nodes are measured (each node asks for one as it mounts).
 */
const useFitViewWhenMeasured = () => {
  const nodesInitialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  const fitted = useRef(false);
  useEffect(() => {
    if (!nodesInitialized || fitted.current) return;
    fitted.current = true;
    void fitView();
  }, [nodesInitialized, fitView]);
};

const Canvas: FC<CanvasProps> = ({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  isValidConnection,
  onNodeDoubleClick,
  onNodeDragStart,
  onNodeDrag,
  onNodeDragStop,
  onConnectStart,
  onConnectEnd,
  history,
  onShowShortcuts,
  onZoomToFailed,
}) => {
  const reactFlowWrapper = React.useRef<HTMLDivElement>(null);
  useFitViewWhenMeasured();
  // The minimap stays as chosen in this browser.
  const [minimap, setMinimap] = React.useState(readMinimap);
  const toggleMinimap = () => {
    const shown = !minimap;
    setMinimap(shown);
    logActivity("minimap.toggled", { shown });
    try {
      localStorage.setItem(MINIMAP_KEY, shown ? "on" : "off");
    } catch {
      // Not kept; still toggled for now.
    }
  };

  return (
    <div className="flex-grow h-full" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        connectionMode={ConnectionMode.Loose}
        deleteKeyCode={["Backspace", "Delete"]}
        className="bg-background"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <CustomControls
          history={history}
          onShowShortcuts={onShowShortcuts}
          minimap={{ shown: minimap, toggle: toggleMinimap }}
          onZoomToFailed={onZoomToFailed}
        />
        {minimap && <CanvasMinimap />}
      </ReactFlow>
    </div>
  );
};

export default Canvas;
