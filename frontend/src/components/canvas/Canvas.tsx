import React, { type FC } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  ConnectionMode,
} from "reactflow";
import type {
  Edge,
  Node,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
  Connection,
} from "reactflow";

import CustomControls from "./CustomControls";
import CustomEdge from "./CustomEdge";
import BaseNode from "../nodes/BaseNode";
import FileInputNode from "../nodes/input/FileInputNode";
import OutputDisplayNode from "../nodes/output/OutputDisplayNode";
import OperatorNode from "../nodes/OperatorNode";

const nodeTypes = {
  default: BaseNode,
  fileInput: FileInputNode,
  outputDisplay: OutputDisplayNode,
  filter: OperatorNode,
  operator: OperatorNode,
  process: BaseNode,
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
  isValidConnection: (connection: Connection) => boolean;
  onNodeDoubleClick: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStart: (event: React.MouseEvent, node: Node) => void;
  onNodeDrag: (event: React.MouseEvent, node: Node) => void;
  onNodeDragStop: (event: React.MouseEvent, node: Node) => void;
  onConnectStart: (event: any, params: any) => void;
  onConnectEnd: (event: any) => void;
}

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
}) => {
  const reactFlowWrapper = React.useRef<HTMLDivElement>(null);

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
        fitView
        className="bg-background"
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <CustomControls />
      </ReactFlow>
    </div>
  );
};

export default Canvas;
