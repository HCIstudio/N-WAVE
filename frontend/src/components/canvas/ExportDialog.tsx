// Export in the bottom bar: one dialog with every way to take the workflow
// out of N-WAVE (the script, a runnable project, a DAW model, diagrams).

import { Copy, FileCode, FolderDown, Network, Share2 } from "lucide-react";
import type React from "react";
import { useId, useState } from "react";
import { DIAGRAM_FORMATS, type DiagramFormat } from "../../export/diagrams";
import Modal from "../common/dialogs/Modal";

export interface ExportActions {
  /** Download the Nextflow script (a Pipeline node's launch script). */
  onDownload: () => void;
  /** Copy the same script to the clipboard. */
  onCopyScript?: () => void;
  /** Download a runnable project (zip with modules, config and inputs). */
  onExportProject?: () => void;
  /** Download the workflow as a DAW model (the metamodel's JSON). */
  onExportDawModel?: () => void;
  /** The diagrams there are (the canvas; the analysis's graphs once analysed). */
  diagramSources?: Array<{ id: string; label: string }>;
  /** Download a diagram of one source in one format. */
  onDiagram?: (source: string, format: DiagramFormat) => void;
}

interface Choice {
  icon: React.ElementType;
  title: string;
  what: string;
  action: string;
  run?: () => void;
  /** Another, smaller action for the same thing. */
  extra?: { label: string; run?: () => void };
}

const ExportDialog: React.FC<ExportActions & { isOpen: boolean; onClose: () => void }> = ({
  isOpen,
  onClose,
  onDownload,
  onCopyScript,
  onExportProject,
  onExportDawModel,
  diagramSources = [],
  onDiagram,
}) => {
  const sourceId = useId();
  const [chosenSource, setSource] = useState<string | null>(null);
  const diagramSource = diagramSources.some((source) => source.id === chosenSource)
    ? (chosenSource as string)
    : (diagramSources[0]?.id ?? "editor");
  const choices: Choice[] = [
    {
      icon: FileCode,
      title: "Nextflow script",
      what: "The workflow's main.nf: one file to read, share or run where its modules are. For a Pipeline node, the script that launches the pipeline.",
      action: "Download script",
      run: onDownload,
      extra: { label: "Copy script", run: onCopyScript },
    },
    {
      icon: FolderDown,
      title: "Project",
      what: "A zip with the script, nextflow.config, the modules and the input files, and a README. It runs with Nextflow alone, without N-WAVE.",
      action: "Download project",
      run: onExportProject,
    },
    {
      icon: Share2,
      title: "DAW model",
      what: "The workflow in the language-neutral workflow metamodel, as JSON, for other tools. Import it in N-WAVE to get this canvas back.",
      action: "Download DAW model",
      run: onExportDawModel,
    },
  ];

  const choose = (run: () => void) => {
    run();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export workflow">
      <ul className="space-y-3">
        {choices
          .filter((choice) => choice.run)
          .map(({ icon: Icon, title, what, action, run, extra }) => (
            <li key={title} className="flex items-start gap-3 rounded-md border border-panel-border p-3">
              <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-nextflow-green" />
              <div className="min-w-0 flex-grow">
                <h3 className="text-sm font-medium text-text">{title}</h3>
                <p className="mt-0.5 text-xs text-text-light">{what}</p>
              </div>
              <div className="flex w-44 shrink-0 flex-col items-stretch gap-1">
                <button
                  type="button"
                  onClick={() => run && choose(run)}
                  className="rounded-md bg-nextflow-green px-3 py-1.5 text-sm font-medium text-white hover:bg-nextflow-green-dark"
                >
                  {action}
                </button>
                {extra?.run && (
                  <button
                    type="button"
                    onClick={() => extra.run && choose(extra.run)}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-accent px-3 py-1 text-xs text-text hover:bg-accent"
                  >
                    <Copy aria-hidden className="h-3 w-3" />
                    {extra.label}
                  </button>
                )}
              </div>
            </li>
          ))}
        {onDiagram && diagramSources.length > 0 && (
          <li className="flex items-start gap-3 rounded-md border border-panel-border p-3">
            <Network aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-nextflow-green" />
            <div className="min-w-0 flex-grow">
              <h3 className="text-sm font-medium text-text">Diagram</h3>
              <p className="mt-0.5 text-xs text-text-light">
                A picture of the workflow for papers and slides (SVG, PNG), or as text that Mermaid
                and Graphviz draw. Analyse the workflow to also get the specification graph and the
                process dependency graph of its code.
              </p>
              {diagramSources.length > 1 && (
                <label htmlFor={sourceId} className="mt-2 block text-xs text-text-light">
                  Of
                  <select
                    id={sourceId}
                    value={diagramSource}
                    onChange={(event) => setSource(event.target.value)}
                    className="mt-1 block w-full rounded-md border border-panel-border bg-background px-2 py-1 text-sm text-text"
                  >
                    {diagramSources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {source.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="grid w-44 shrink-0 grid-cols-2 gap-1">
              {DIAGRAM_FORMATS.map(({ format, label }) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => choose(() => onDiagram(diagramSource, format))}
                  aria-label={`Download diagram as ${label}`}
                  className="rounded-md border border-accent px-2 py-1.5 text-sm text-text hover:bg-accent"
                >
                  {label}
                </button>
              ))}
            </div>
          </li>
        )}
      </ul>
    </Modal>
  );
};

export default ExportDialog;
