import type React from "react";
import type { Node } from "reactflow";
import { isDemoMode } from "../../../api";
import RunResultsList from "../../common/workflow/RunResultsList";
import type { NodeData } from "../../nodes/BaseNode";

export { keyReports } from "../../common/workflow/RunResultsList";

/** The results of the Pipeline node's last run, with its key reports. */
const PipelineResults: React.FC<{ node: Node<NodeData> }> = ({ node }) => {
  const lastRun = node.data.pipelineLastRun as
    | { id: string; finishedAt: string; success: boolean }
    | undefined;

  return (
    <div className="space-y-2 border-t border-accent pt-4">
      <h4 className="text-sm font-semibold text-text">Results</h4>
      {isDemoMode ? (
        <p className="text-xs text-text-light">
          The demo can&apos;t run pipelines. Export the project and run the
          command above, or use the Docker version of N-WAVE.
        </p>
      ) : !lastRun ? (
        <p className="text-xs text-text-light">
          Run the workflow to see the pipeline&apos;s reports here.
        </p>
      ) : (
        <>
          <p className="text-xs text-text-light">
            Last run {lastRun.success ? "finished" : "failed"}{" "}
            {new Date(lastRun.finishedAt).toLocaleString()} (
            <span className="font-mono">{lastRun.id}</span>).
          </p>
          <RunResultsList runId={lastRun.id} label="Pipeline reports" />
        </>
      )}
    </div>
  );
};

export default PipelineResults;
