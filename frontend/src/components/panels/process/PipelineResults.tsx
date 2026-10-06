import type React from "react";
import { useEffect, useState } from "react";
import type { Node } from "reactflow";
import { isDemoMode } from "../../../api";
import {
  listRunResults,
  type RunResultFile,
  runResultUrl,
} from "../../../api/runs";
import { getErrorMessage } from "../../../utils/errors";
import type { NodeData } from "../../nodes/BaseNode";

/** Reports worth a direct link: MultiQC and Nextflow's run reports. */
export const keyReports = (files: RunResultFile[]): RunResultFile[] =>
  files.filter(
    (file) =>
      /(^|\/)multiqc_report\.html$/.test(file.path) ||
      /^pipeline_info\/execution_(report|timeline)[^/]*\.html$/.test(file.path),
  );

/** The results of the Pipeline node's last run, with its key reports. */
const PipelineResults: React.FC<{ node: Node<NodeData> }> = ({ node }) => {
  const lastRun = node.data.pipelineLastRun as
    | { id: string; finishedAt: string; success: boolean }
    | undefined;
  const [state, setState] = useState<
    | { status: "idle" | "loading" }
    | { status: "loaded"; files: RunResultFile[] }
    | { status: "error"; message: string }
  >({ status: "idle" });

  useEffect(() => {
    if (!lastRun?.id || isDemoMode) return;
    let cancelled = false;
    setState({ status: "loading" });
    listRunResults(lastRun.id).then(
      (files) => !cancelled && setState({ status: "loaded", files }),
      (error: unknown) =>
        !cancelled &&
        setState({
          status: "error",
          message: getErrorMessage(error, "Could not list the run's results."),
        }),
    );
    return () => {
      cancelled = true;
    };
  }, [lastRun?.id]);

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
          {state.status === "loading" && (
            <p className="text-xs text-text-light">Loading results…</p>
          )}
          {state.status === "error" && (
            <p role="alert" className="text-xs text-danger">
              {state.message}
            </p>
          )}
          {state.status === "loaded" && (
            <>
              <ul aria-label="Pipeline reports" className="space-y-1 text-sm">
                {keyReports(state.files).map((file) => (
                  <li key={file.path}>
                    <a
                      href={runResultUrl(lastRun.id, file.path)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-nextflow-green hover:underline"
                    >
                      {file.path}
                    </a>
                  </li>
                ))}
              </ul>
              <details className="text-xs text-text-light">
                <summary className="cursor-pointer">
                  All result files ({state.files.length})
                </summary>
                <ul className="mt-1 max-h-64 space-y-0.5 overflow-y-auto font-mono">
                  {state.files.map((file) => (
                    <li key={file.path}>
                      <a
                        href={runResultUrl(lastRun.id, file.path)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline"
                      >
                        {file.path}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default PipelineResults;
