import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BookOpen, Pencil, Trash2, Save, Copy, Upload } from "lucide-react";
import api from "../api";
import {
  ConfirmDialog,
  ActionDialog,
  Modal,
  type ActionButtonProps,
} from "../components/common";
import PageLayout from "../components/layout/PageLayout";
import { buildInfo } from "../utils/buildInfo";
import { Loader } from "lucide-react";
import type { WorkflowDescriptor } from "../types/backend";

const DEMO_WORKFLOW_ID = "builtin:demo-basic";
const TUTORIAL_COMPLETED_KEY = "nwave.demoTutorial.completed";
const TUTORIAL_ACTIVE_KEY = "nwave.demoTutorial.active";
const TUTORIAL_STEP_KEY = "nwave.demoTutorial.step";

const HomePage: React.FC = () => {
  const [workflows, setWorkflows] = useState<WorkflowDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    name: string;
    description: string;
  }>({
    name: "",
    description: "",
  });
  const [originalEditData, setOriginalEditData] = useState<{
    name: string;
    description: string;
  } | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isUnsavedChangesModalOpen, setIsUnsavedChangesModalOpen] =
    useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importName, setImportName] = useState("");
  const [importDescription, setImportDescription] = useState("");
  const [importSource, setImportSource] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const nameTextareaRef = useRef<HTMLTextAreaElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editingCardRef = useRef<HTMLDivElement>(null);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const [isTutorialIntroVisible, setIsTutorialIntroVisible] = useState(() => {
    return sessionStorage.getItem(TUTORIAL_COMPLETED_KEY) !== "true";
  });

  const skipTutorial = () => {
    sessionStorage.setItem(TUTORIAL_COMPLETED_KEY, "true");
    sessionStorage.removeItem(TUTORIAL_ACTIVE_KEY);
    sessionStorage.removeItem(TUTORIAL_STEP_KEY);
    setIsTutorialIntroVisible(false);
  };

  const startTutorial = () => {
    sessionStorage.setItem(TUTORIAL_ACTIVE_KEY, "true");
    sessionStorage.setItem(TUTORIAL_STEP_KEY, "0");
  };

  const retakeTutorial = () => {
    sessionStorage.removeItem(TUTORIAL_COMPLETED_KEY);
    sessionStorage.removeItem(TUTORIAL_ACTIVE_KEY);
    sessionStorage.removeItem(TUTORIAL_STEP_KEY);
    setIsTutorialIntroVisible(true);
  };

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const response = await api.get("/workflows");
      setWorkflows(response.data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch workflows.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  useEffect(() => {
    const resizeTextarea = (ref: React.RefObject<HTMLTextAreaElement>) => {
      if (ref.current) {
        ref.current.style.height = "auto";
        ref.current.style.height = `${ref.current.scrollHeight}px`;
      }
    };
    if (editingId) {
      resizeTextarea(nameTextareaRef);
      resizeTextarea(descriptionTextareaRef);
    }
  }, [editingId, editData]);

  const handleEditClick = (e: React.MouseEvent, wf: WorkflowDescriptor) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(wf._id);
    const data = { name: wf.name || "", description: wf.description || "" };
    setEditData(data);
    setOriginalEditData(data);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
    field: "name" | "description"
  ) => {
    setEditData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async (id: string) => {
    try {
      await api.put(`/workflows/${id}`, editData);
      setWorkflows((prev) =>
        prev.map((wf) => (wf._id === id ? { ...wf, ...editData } : wf))
      );
      setEditingId(null);
      setOriginalEditData(null);
    } catch (err) {
      setError("Failed to update workflow.");
      console.error(err);
    }
  };

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setOriginalEditData(null);
  }, []);

  const checkForUnsavedChanges = useCallback(() => {
    if (!originalEditData) return false;
    return (
      originalEditData.name !== editData.name ||
      originalEditData.description !== editData.description
    );
  }, [originalEditData, editData]);

  const attemptCloseEditor = useCallback(() => {
    if (checkForUnsavedChanges()) {
      setIsUnsavedChangesModalOpen(true);
    } else {
      handleCancelEdit();
    }
  }, [checkForUnsavedChanges, handleCancelEdit]);

  useEffect(() => {
    if (!editingId) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        editingCardRef.current &&
        !editingCardRef.current.contains(event.target as Node)
      ) {
        attemptCloseEditor();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [editingId, attemptCloseEditor]);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setWorkflowToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const handleDuplicate = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const response = await api.post(`/workflows/${id}/duplicate`);
      navigate(`/workflow/${response.data._id}`);
    } catch (err) {
      setError("Failed to duplicate workflow.");
      console.error(err);
    }
  };

  const confirmDelete = async () => {
    if (!workflowToDelete) return;
    try {
      await api.delete(`/workflows/${workflowToDelete}`);
      setWorkflows((prev) => prev.filter((wf) => wf._id !== workflowToDelete));
    } catch (err) {
      setError("Failed to delete workflow.");
      console.error(err);
    } finally {
      setIsDeleteModalOpen(false);
      setWorkflowToDelete(null);
    }
  };

  const handleNewWorkflow = async () => {
    try {
      // Default execution settings for new workflows
      const defaultExecutionSettings = {
        mode: "docker",
        nextflow: {
          version: "25.04.4",
          forceVersion: false,
          enableDsl2: true,
          enableTrace: false,
          enableTimeline: false,
          enableReport: false,
        },
        output: {
          directory: "results",
          namingPattern: "{workflow_name}_{timestamp}",
          overwrite: false,
          keepWorkDir: false,
        },
        container: {
          enabled: true,
          defaultImage: "ubuntu:22.04",
          registry: "docker.io",
          pullPolicy: "if-not-present",
          customRunOptions: [],
        },
        resources: {
          maxCpus: 4,
          maxMemory: "4.GB",
          maxTime: "PT30M",
          executor: "local",
        },
        errorHandling: {
          strategy: "terminate",
          maxRetries: 0,
          backoffStrategy: "exponential",
          continueOnError: false,
        },
        environment: {
          profile: "standard",
          customParams: {},
          environmentVariables: {},
        },
        cleanup: {
          onSuccess: false,
          onFailure: false,
          intermediateFiles: false,
          workDirectory: false,
        },
        validation: {
          requireContainer: false,
          allowMissingInputs: false,
          strictChannelTypes: false,
          enableTypeChecking: false,
        },
      };

      const response = await api.post("/workflows", {
        name: "Untitled Workflow",
        nodes: [],
        edges: [],
        description: "",
        executionSettings: defaultExecutionSettings,
      });
      navigate(`/workflow/${response.data._id}`);
    } catch (err) {
      setError("Failed to create new workflow.");
      console.error(err);
    }
  };

  const resetImportForm = () => {
    setImportName("");
    setImportDescription("");
    setImportSource("");
    setImportFileName("");
    if (importFileInputRef.current) {
      importFileInputRef.current.value = "";
    }
  };

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const content = await file.text();
      setImportSource(content);
      setImportFileName(file.name);
      if (!importName.trim()) {
        setImportName(file.name.replace(/\.[^.]+$/, ""));
      }
    } catch (err) {
      setError("Failed to read import file.");
      console.error(err);
    }
  };

  const handleImportWorkflow = async () => {
    if (!importSource.trim()) {
      setError("Nextflow source is required for import.");
      return;
    }

    try {
      setIsImporting(true);
      const response = await api.post("/workflows/import", {
        name: importName.trim() || undefined,
        description: importDescription.trim() || undefined,
        rawSource: importSource,
        sourceKey: importFileName || undefined,
      });
      setIsImportModalOpen(false);
      resetImportForm();
      navigate(`/workflow/${response.data._id}`);
    } catch (err) {
      setError("Failed to import workflow.");
      console.error(err);
    } finally {
      setIsImporting(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (editingId && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave(editingId);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      attemptCloseEditor();
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-text-light text-xl flex items-center gap-2">
            <Loader className="animate-spin text-nextflow-green" />
            <span className="text-nextflow-green">Loading workflows...</span>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <div className="p-8 text-center text-red-500">{error}</div>
      </PageLayout>
    );
  }

  const unsavedChangesActions: ActionButtonProps[] = [
    {
      text: "Cancel",
      onClick: () => setIsUnsavedChangesModalOpen(false),
      className: "bg-gray-200 hover:bg-gray-300 text-gray-800",
      closeOnClick: true,
    },
    {
      text: "Discard",
      onClick: () => {
        handleCancelEdit();
        setIsUnsavedChangesModalOpen(false);
      },
      className: "bg-red-600 hover:bg-red-700 text-white",
      closeOnClick: true,
    },
    {
      text: "Save Changes",
      onClick: () => {
        if (editingId) handleSave(editingId);
        setIsUnsavedChangesModalOpen(false);
      },
      className: "bg-nextflow-green hover:bg-nextflow-green-dark text-white",
      closeOnClick: true,
    },
  ];

  const hasDemoWorkflow = workflows.some(
    (wf) => wf._id === DEMO_WORKFLOW_ID || wf.isBuiltin
  );
  const isHomeTutorialActive = isTutorialIntroVisible && hasDemoWorkflow;

  const renderWorkflowCard = (wf: WorkflowDescriptor) => {
    const isEditing = editingId === wf._id;
    const isReadOnly = wf.isReadOnly || wf.origin?.readOnly;
    const showDuplicate = Boolean(wf.origin?.canDuplicate);
    const isDemoWorkflow = wf._id === DEMO_WORKFLOW_ID || wf.isBuiltin;
    const hideCardButtons = isHomeTutorialActive && isDemoWorkflow;

    const cardContent = (
      <>
        {!hideCardButtons && (
        <div className="absolute top-4 right-2 z-10 flex items-center gap-1">
          {isEditing ? (
            <>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (editingId) handleSave(editingId);
                }}
                className="p-1 text-text-light hover:text-white"
                aria-label="Save"
              >
                <Save size={16} />
              </button>
              {!isReadOnly && (
                <button
                  onClick={(e) => handleDeleteClick(e, wf._id)}
                  className="p-1 text-text-light hover:text-red-500"
                  aria-label="Delete"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </>
          ) : (
            <>
              {!isReadOnly && (
                <button
                  onClick={(e) => handleEditClick(e, wf)}
                  className="p-1 text-text-light hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Edit"
                >
                  <Pencil size={16} />
                </button>
              )}
              {showDuplicate && (
                <button
                  onClick={(e) => handleDuplicate(e, wf._id)}
                  className="p-1 text-text-light hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Duplicate"
                >
                  <Copy size={16} />
                </button>
              )}
              {!isReadOnly && (
                <button
                  onClick={(e) => handleDeleteClick(e, wf._id)}
                  className="p-1 text-text-light hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Delete"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </>
          )}
        </div>
        )}
        {isEditing ? (
          <>
            <div className="pr-12">
              <textarea
                ref={nameTextareaRef}
                value={editData.name}
                onChange={(e) => handleInputChange(e, "name")}
                onKeyDown={handleInputKeyDown}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="text-lg font-semibold bg-transparent border border-gray-600 rounded-md text-nextflow-green focus:outline-none focus:border-nextflow-green focus:ring-1 focus:ring-nextflow-green w-full resize-none overflow-hidden p-2"
                rows={1}
                autoFocus
              />
            </div>
            <textarea
              ref={descriptionTextareaRef}
              value={editData.description}
              onChange={(e) => handleInputChange(e, "description")}
              onKeyDown={handleInputKeyDown}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="text-sm bg-transparent border border-gray-600 rounded-md text-text focus:outline-none focus:border-nextflow-green focus:ring-1 focus:ring-nextflow-green w-full mt-2 resize-none overflow-hidden p-2"
              rows={1}
              placeholder="Add a description..."
            />
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-nextflow-green whitespace-pre-wrap h-[42px] overflow-hidden p-2 pr-12">
              {wf.name}
            </h2>
            <p className="text-sm text-text-light mt-2 whitespace-pre-wrap h-[40px] overflow-hidden p-2">
              {wf.description || (
                <span className="text-gray-500 italic">No description</span>
              )}
            </p>
            {isReadOnly && (
              <div className="px-2 pt-1 text-xs text-gray-400">Read-only demo</div>
            )}
          </>
        )}
      </>
    );

    if (isEditing) {
      return (
        <div
          ref={editingCardRef}
          key={wf._id}
          className="group relative block bg-accent rounded-lg shadow-sm p-4"
        >
          {cardContent}
        </div>
      );
    }

    return (
      <Link
        key={wf._id}
        to={`/workflow/${wf._id}`}
        onClick={() => {
          if (isDemoWorkflow && isHomeTutorialActive) {
            startTutorial();
          }
        }}
        className="group relative block bg-accent rounded-lg shadow-sm hover:shadow-md transition-shadow p-4"
      >
        {cardContent}
      </Link>
    );
  };

  return (
    <PageLayout>
      <div className="min-h-screen flex flex-col">
        {isHomeTutorialActive && (
          <div className="fixed inset-0 z-20 bg-black/35" aria-hidden="true" />
        )}
        <div className="flex-1 p-8">
          <div className="mb-6 flex items-center justify-between gap-4">
            <h1 className="text-3xl font-bold text-text">Workflows</h1>
            <div className="flex items-center gap-3">
              {!isHomeTutorialActive && (
                <button
                  type="button"
                  onClick={retakeTutorial}
                  className="inline-flex items-center gap-2 rounded-lg border border-accent px-4 py-2 text-sm font-medium text-nextflow-green hover:bg-accent transition-colors"
                >
                  Retake Tutorial
                </button>
              )}
              <a
                href="https://github.com/HCIstudio/N-WAVE/wiki"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-accent px-4 py-2 text-sm font-medium text-nextflow-green hover:bg-accent transition-colors"
              >
                <BookOpen size={16} />
                <span>Wiki</span>
              </a>
              <button
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-accent px-4 py-2 text-sm font-medium text-nextflow-green hover:bg-accent transition-colors"
              >
                <Upload size={16} />
                <span>Import Workflow</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {workflows.map((wf) => {
              const isDemoWorkflow = wf._id === DEMO_WORKFLOW_ID || wf.isBuiltin;
              return (
                <div
                  key={wf._id}
                  className={
                    isHomeTutorialActive && isDemoWorkflow
                      ? "relative z-30"
                      : "relative"
                  }
                >
                  {renderWorkflowCard(wf)}
                  {isHomeTutorialActive && isDemoWorkflow && (
                    <div className="relative z-40 mt-3 rounded-lg border border-nextflow-green/60 bg-background p-4 text-sm text-text shadow-2xl">
                      <p>
                        Getting started: This demo workflow explains the
                        fundamentals of N-Wave
                      </p>
                      <button
                        type="button"
                        onClick={skipTutorial}
                        className="mt-3 rounded-md bg-nextflow-green px-3 py-1.5 text-sm font-medium text-white hover:bg-nextflow-green-dark"
                      >
                        Skip Tutorial
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            <div
              onClick={handleNewWorkflow}
              className="flex items-center justify-center p-6 bg-transparent border-2 border-dashed border-accent rounded-lg text-nextflow-green hover:bg-accent cursor-pointer transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span className="ml-2">New Workflow</span>
            </div>
          </div>
        </div>
        <ConfirmDialog
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={confirmDelete}
          title="Delete Workflow"
          message="Are you sure you want to delete this workflow? This action cannot be undone."
          confirmText="Delete"
        />
        <ActionDialog
          isOpen={isUnsavedChangesModalOpen}
          onClose={() => setIsUnsavedChangesModalOpen(false)}
          title="Unsaved Changes"
          message="You have unsaved changes. What would you like to do?"
          actions={unsavedChangesActions}
        />
        <Modal
          isOpen={isImportModalOpen}
          onClose={() => {
            if (!isImporting) {
              setIsImportModalOpen(false);
              resetImportForm();
            }
          }}
          title="Import Nextflow Workflow"
          footer={
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  resetImportForm();
                }}
                className="rounded-md bg-gray-200 px-4 py-2 text-gray-800 hover:bg-gray-300"
                disabled={isImporting}
              >
                Cancel
              </button>
              <button
                onClick={handleImportWorkflow}
                className="rounded-md bg-nextflow-green px-4 py-2 text-white hover:bg-nextflow-green-dark disabled:opacity-50"
                disabled={isImporting || !importSource.trim()}
              >
                {isImporting ? "Importing..." : "Import"}
              </button>
            </div>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-text">Name</label>
              <input
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                className="w-full rounded-md border border-gray-600 bg-accent p-2 text-text focus:border-nextflow-green focus:outline-none"
                placeholder="Imported Nextflow Workflow"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-text">Description</label>
              <textarea
                value={importDescription}
                onChange={(e) => setImportDescription(e.target.value)}
                className="w-full rounded-md border border-gray-600 bg-accent p-2 text-text focus:border-nextflow-green focus:outline-none"
                rows={2}
                placeholder="Optional description"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-text">
                Nextflow File
              </label>
              <div className="flex gap-2">
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".nf,.txt,.groovy"
                  onChange={handleImportFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => importFileInputRef.current?.click()}
                  className="rounded-md border border-accent px-3 py-2 text-sm text-text hover:bg-accent"
                >
                  Choose File
                </button>
                <div className="flex min-w-0 items-center text-sm text-text-light">
                  <span className="truncate">
                    {importFileName || "No file selected"}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm text-text">
                Nextflow Source
              </label>
              <textarea
                value={importSource}
                onChange={(e) => setImportSource(e.target.value)}
                className="min-h-[220px] w-full rounded-md border border-gray-600 bg-accent p-2 font-mono text-sm text-text focus:border-nextflow-green focus:outline-none"
                placeholder="Paste a Nextflow workflow here or load a .nf file."
              />
            </div>
          </div>
        </Modal>
        <footer className="border-t border-accent/60 bg-accent/30 px-8 py-4 text-xs text-text-light">
          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
            <span>With the help of HU Berlin & HCIstudio</span>
            <span>Version {buildInfo.version}</span>
            <span>Built {buildInfo.displayBuildDate}</span>
            <span>SHA {buildInfo.sha}</span>
          </div>
        </footer>
      </div>
    </PageLayout>
  );
};

export default HomePage;
