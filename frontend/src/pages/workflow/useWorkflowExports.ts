// What the Export dialog does for the open workflow: each export, with a
// toast that says what was made or why it couldn't be.

import { useState } from "react";
import type { BioflowResult } from "../../analysis/bioflow";
import type { ExportActions } from "../../components/canvas/ExportDialog";
import type { DiagramFormat } from "../../export/diagrams";
import { getApiErrorMessage } from "../../utils/errors";
import { groupsOf } from "../../groups/groups";
import {
  copyScript,
  type DiagramSource,
  diagramSources,
  downloadDawModel,
  downloadDiagram,
  downloadScript,
  exportProject,
  type WorkflowSource,
} from "./workflowExport";

type ShowToast = (message: string, type: "success" | "error") => void;

/**
 * The exports of `source`; `analysed` is the analysis of its steps as they
 * are, if any (its graphs can be drawn too).
 */
export const useWorkflowExports = (
  source: WorkflowSource,
  analysed: BioflowResult | null,
  showToast: ShowToast,
): { exports: ExportActions; isExporting: boolean } => {
  const [isExporting, setIsExporting] = useState(false);

  /** Run an export; say what it made (`done`), or why it failed. */
  const attempt = async <T>(run: () => T | Promise<T>, done: (result: T) => string | null, failed: string) => {
    try {
      const message = done(await run());
      if (message) showToast(message, "success");
    } catch (error) {
      // e.g. a cycle in the workflow, or the backend's reason
      showToast(getApiErrorMessage(error, failed), "error");
    }
  };

  return {
    isExporting,
    exports: {
      onDownload: () =>
        void attempt(() => downloadScript(source), () => null, "An unknown error occurred during script generation."),
      onCopyScript: () => void attempt(() => copyScript(source), () => "Copied the Nextflow script.", "Couldn't copy the script."),
      onExportProject: async () => {
        setIsExporting(true);
        await attempt(
          () => exportProject(source),
          (fileName) => `Exported ${fileName}. Unzip it and see README.md for how to run it.`,
          "Failed to export the project.",
        );
        setIsExporting(false);
      },
      onExportDawModel: () =>
        void attempt(
          () => downloadDawModel(source),
          (fileName) => `Exported ${fileName}: the workflow as a DAW model. Import it in N-WAVE to get this canvas back.`,
          "Failed to export the DAW model.",
        ),
      diagramSources: diagramSources(analysed, groupsOf(source.nodes).size > 0),
      onDiagram: (which: string, format: DiagramFormat) =>
        void attempt(
          () => downloadDiagram(source, which as DiagramSource, format, analysed),
          (fileName) => `Exported ${fileName}.`,
          "Couldn't draw the diagram.",
        ),
    },
  };
};
