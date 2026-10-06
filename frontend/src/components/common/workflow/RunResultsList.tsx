import type React from "react";
import { useEffect, useState } from "react";
import {
  listRunResults,
  type RunResultFile,
  runResultUrl,
} from "../../../api/runs";
import { getErrorMessage } from "../../../utils/errors";

/** Reports worth a direct link: MultiQC and Nextflow's run reports. */
export const keyReports = (files: RunResultFile[]): RunResultFile[] =>
  files.filter(
    (file) =>
      /(^|\/)multiqc_report\.html$/.test(file.path) ||
      /^pipeline_info\/execution_(report|timeline)[^/]*\.html$/.test(file.path),
  );

/** A run's key reports, linked, and all its result files. */
const RunResultsList: React.FC<{ runId: string; label: string }> = ({
  runId,
  label,
}) => {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "loaded"; files: RunResultFile[] }
    | { status: "error"; message: string }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    listRunResults(runId).then(
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
  }, [runId]);

  if (state.status === "loading") {
    return <p className="text-xs text-text-light">Loading results…</p>;
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="text-xs text-danger">
        {state.message}
      </p>
    );
  }
  return (
    <>
      <ul aria-label={label} className="space-y-1 text-sm">
        {keyReports(state.files).map((file) => (
          <li key={file.path}>
            <a
              href={runResultUrl(runId, file.path)}
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
                href={runResultUrl(runId, file.path)}
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
  );
};

export default RunResultsList;
