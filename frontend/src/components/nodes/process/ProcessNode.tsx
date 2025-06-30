import { memo } from "react";
import type { NodeProps } from "reactflow";
import BaseNode, { type NodeData } from "../BaseNode";

const ProcessNode = (props: NodeProps<NodeData>) => {
  const { data } = props;

  // Restore the fallback logic to ensure nodes always have a connectable port,
  // but ensure it aligns with the expected data structure.
  const dataWithPorts: NodeData = {
    ...data,
    // If inputs are not defined in the process preset, provide a default.
    inputs: data.inputs || [{ name: "in", isConnectable: true }],
    // If outputs are not defined, provide a default.
    outputs: data.outputs || [{ name: "out", isConnectable: true }],
  };

  return <BaseNode {...props} data={dataWithPorts} />;
};

export default memo(ProcessNode);
