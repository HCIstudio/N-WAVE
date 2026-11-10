import clsx from "clsx";
import React, { type FC, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Panel,
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
import { useFeature } from "../../settings/useFeatures";
import CustomEdge from "./CustomEdge";
import DerivedEdge from "./DerivedEdge";
import BaseNode from "../nodes/BaseNode";
import NoteNode from "../nodes/note/NoteNode";
import FileInputNode from "../nodes/input/FileInputNode";
import OutputDisplayNode from "../nodes/output/OutputDisplayNode";
import OperatorNode from "../nodes/OperatorNode";
import ProcessNode from "../nodes/process/ProcessNode";
import { GroupBoxNode, GroupFrameNode } from "./GroupNodes";

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
  // Groups of steps (#221): a frame in All, a box in Grouped.
  groupFrame: GroupFrameNode,
  groupBox: GroupBoxNode,
};

const edgeTypes = {
  default: CustomEdge,
  custom: CustomEdge,
  // Drawn by N-WAVE, not by the user: connections made in code, steps
  // connected through hidden channel code.
  derived: DerivedEdge,
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
  /**
   * A read-only view (the process graph, groups), drawn as a blueprint so it
   * can't be mistaken for the editor: its name is in the title block.
   */
  blueprint?: string;
  /** A view that can't be edited (Steps only): no connecting or deleting. */
  readOnly?: boolean;
}

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
  readOnly = false,
  blueprint,
}) => {
  const reactFlowWrapper = React.useRef<HTMLDivElement>(null);
  useFitViewWhenMeasured();
  // Switched on or off for everyone in Global Settings → Features.
  const minimapOn = useFeature("minimap");

  return (
    <div
      className={clsx("flex-grow h-full", blueprint && "canvas-blueprint")}
      data-blueprint={blueprint ? "true" : undefined}
      ref={reactFlowWrapper}
    >
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
        nodesConnectable={!readOnly}
        deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
        className={blueprint ? "" : "bg-background"}
        proOptions={{ hideAttribution: true }}
      >
        {blueprint ? (
          <>
            {/* Blueprint paper: a fine grid, and a major line every fifth. */}
            <Background id="blueprint-minor" variant={BackgroundVariant.Lines} gap={24} lineWidth={0.5} color="rgba(186, 220, 255, 0.16)" />
            <Background id="blueprint-major" variant={BackgroundVariant.Lines} gap={120} lineWidth={1} color="rgba(186, 220, 255, 0.32)" />
          </>
        ) : (
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        )}
        <CustomControls
          history={history}
          onShowShortcuts={onShowShortcuts}
          onZoomToFailed={onZoomToFailed}
        />
        {minimapOn && <CanvasMinimap />}
        {blueprint && (
          // The title block of a drawing: which view this is.
          <Panel position="top-left">
            <div role="note" aria-label="Read-only view" className="blueprint-title-block">
              <span className="blueprint-title">{blueprint}</span>
              <span className="blueprint-subtitle">Read-only view</span>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
};

export default Canvas;
