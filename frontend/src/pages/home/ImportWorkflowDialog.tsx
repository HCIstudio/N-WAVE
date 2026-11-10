// Import Workflow on the home page: a Nextflow script, a project (zip or
// folder) or a DAW model, read in the browser and saved as a new workflow.

import type React from "react";
import { useId, useRef, useState } from "react";
import { useNavigate } from "react-router";
import api from "../../api";
import { logActivity } from "../../activity/activityLog";
import { Modal } from "../../components/common";
import { looksLikeDawModel } from "../../metamodel/dawModel";
import { importDawWorkflow } from "../../workflows/importDawWorkflow";
import { importNextflowWorkflow } from "../../workflows/importNextflowWorkflow";
import { type ImportProject, readFolder, readProject, readZip } from "../../workflows/import/readProject";

interface ImportForm {
  name: string;
  description: string;
  source: string;
  /** What was loaded, as shown next to the buttons (and the import's source key). */
  fileName: string;
  /** A whole project (zip or folder): its other files go with the main script. */
  project: ImportProject | null;
}

const EMPTY: ImportForm = { name: "", description: "", source: "", fileName: "", project: null };

const FIELD =
  "w-full rounded-md border border-gray-600 bg-accent p-2 text-text focus:border-nextflow-green focus:outline-none";
const BUTTON = "rounded-md border border-accent px-3 py-2 text-sm text-text hover:bg-accent";

/** A zip by its content (`PK\x03\x04`), whatever its name. */
const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

const ImportWorkflowDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  /** A failure, with the reason (the page shows it). */
  onError: (message: string, error?: unknown) => void;
}> = ({ isOpen, onClose, onError }) => {
  const fieldId = useId();
  const navigate = useNavigate();
  const [form, setForm] = useState<ImportForm>(EMPTY);
  const [isImporting, setIsImporting] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const change = (patch: Partial<ImportForm>) => setForm((current) => ({ ...current, ...patch }));

  const close = () => {
    if (isImporting) return;
    setForm(EMPTY);
    for (const input of [fileInput.current, folderInput.current]) if (input) input.value = "";
    onClose();
  };

  /** Show a project's main script, keeping its other files for the import. */
  const loadProject = (project: ImportProject, label: string) => {
    const scripts = Object.keys(project.files).filter((path) => path.endsWith(".nf")).length;
    setForm((current) => ({
      ...current,
      project,
      source: project.source,
      fileName: `${label} (${project.path}, ${scripts} Nextflow file${scripts === 1 ? "" : "s"})`,
      name: current.name.trim() ? current.name : label.replace(/\.zip$/, "").replace(/_/g, " "),
    }));
  };

  const chooseFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (isZip(bytes)) {
        loadProject(readProject(await readZip(bytes)), file.name);
        return;
      }
      const source = await file.text();
      setForm((current) => ({
        ...current,
        project: null,
        source,
        fileName: file.name,
        name: current.name.trim() ? current.name : file.name.replace(/\.[^.]+$/, ""),
      }));
    } catch (error) {
      onError("Failed to read import file.", error);
    }
  };

  const chooseFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = Array.from(e.target.files ?? []);
    if (chosen.length === 0) return;
    try {
      const folder = chosen[0]?.webkitRelativePath.split("/")[0] || "Project";
      loadProject(readProject(await readFolder(chosen)), folder);
    } catch (error) {
      onError("Failed to read the project folder.", error);
    }
  };

  const importWorkflow = async () => {
    if (!form.source.trim()) {
      onError("Nextflow source is required for import.");
      return;
    }
    setIsImporting(true);
    try {
      // Read into a canvas in the browser, then saved like any new workflow.
      // A DAW model (JSON in the workflow metamodel) or Nextflow, by its content.
      const named = {
        name: form.name.trim() || undefined,
        description: form.description.trim() || undefined,
        sourceKey: form.fileName || undefined,
      };
      const isDawModel = !form.project && looksLikeDawModel(form.source);
      const draft = isDawModel
        ? await importDawWorkflow({ ...named, source: form.source })
        : await importNextflowWorkflow({
            ...named,
            rawSource: form.source,
            ...(form.project
              ? {
                  files: form.project.files,
                  path: form.project.path,
                  config: form.project.config,
                  inputs: form.project.inputs,
                }
              : {}),
          });
      const response = await api.post("/workflows", draft);
      logActivity("workflow.imported", {
        format: isDawModel ? "daw-model" : "nextflow",
        workflowId: response.data._id,
        nodes: draft.nodes.length,
        edges: draft.edges.length,
      });
      setForm(EMPTY);
      onClose();
      navigate(`/workflow/${response.data._id}`);
    } catch (error) {
      onError("Failed to import workflow.", error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      title="Import Nextflow Workflow"
      footer={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={close}
            className="rounded-md bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
            disabled={isImporting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={importWorkflow}
            className="rounded-md bg-nextflow-green px-4 py-2 text-white hover:bg-nextflow-green-dark disabled:opacity-50"
            disabled={isImporting || !form.source.trim()}
          >
            {isImporting ? "Importing..." : "Import"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={`${fieldId}-name`} className="mb-1 block text-sm text-text">
            Name
          </label>
          <input
            id={`${fieldId}-name`}
            type="text"
            value={form.name}
            onChange={(e) => change({ name: e.target.value })}
            className={FIELD}
            placeholder="Imported Nextflow Workflow"
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-description`} className="mb-1 block text-sm text-text">
            Description
          </label>
          <textarea
            id={`${fieldId}-description`}
            value={form.description}
            onChange={(e) => change({ description: e.target.value })}
            className={FIELD}
            rows={2}
            placeholder="Optional description"
          />
        </div>
        <div>
          <label htmlFor={`${fieldId}-nextflow-file`} className="mb-1 block text-sm text-text">
            Nextflow File, Project Zip, Folder or DAW Model
          </label>
          <div className="flex gap-2">
            <input
              id={`${fieldId}-nextflow-file`}
              ref={fileInput}
              type="file"
              accept=".nf,.txt,.groovy,.zip,.json"
              onChange={chooseFile}
              className="hidden"
            />
            <input
              ref={folderInput}
              type="file"
              aria-label="Nextflow project folder"
              // A whole project: main.nf with its modules and nextflow.config.
              {...{ webkitdirectory: "" }}
              onChange={chooseFolder}
              className="hidden"
            />
            <button type="button" onClick={() => fileInput.current?.click()} className={BUTTON}>
              Choose File
            </button>
            <button type="button" onClick={() => folderInput.current?.click()} className={BUTTON}>
              Choose Folder
            </button>
            <div className="flex min-w-0 items-center text-sm text-text-light">
              <span className="truncate">{form.fileName || "No file selected"}</span>
            </div>
          </div>
        </div>
        <div>
          <label htmlFor={`${fieldId}-nextflow-source`} className="mb-1 block text-sm text-text">
            Nextflow Source
          </label>
          <textarea
            id={`${fieldId}-nextflow-source`}
            value={form.source}
            onChange={(e) => change({ source: e.target.value })}
            className={`min-h-[220px] font-mono text-sm ${FIELD}`}
            placeholder="Paste a Nextflow workflow (or a DAW model) here, or load a file."
          />
        </div>
      </div>
    </Modal>
  );
};

export default ImportWorkflowDialog;
