import type React from "react";
import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BookOpen,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import api, { isDemoMode } from "../api";
import {
  ConfirmDialog,
  ActionDialog,
  Modal,
  Toast,
  type ActionButtonProps,
} from "../components/common";
import { getApiErrorMessage } from "../utils/errors";
import PageLayout from "../components/layout/PageLayout";
import { buildInfo } from "../utils/buildInfo";
import { Loader } from "lucide-react";
import type { WorkflowDescriptor } from "../types/backend";
import { defaultExecutionSettings } from "../workflows/defaultExecutionSettings";
import { importNextflowWorkflow } from "../workflows/importNextflowWorkflow";
import hcistudioLogo from "../assets/hcistudio-logo.png";
import fondaLogo from "../assets/fonda-logo.png";

const DEMO_WORKFLOW_ID = "builtin:demo-basic";
const TUTORIAL_COMPLETED_KEY = "nwave.demoTutorial.completed";
const TUTORIAL_ACTIVE_KEY = "nwave.demoTutorial.active";
const TUTORIAL_STEP_KEY = "nwave.demoTutorial.step";
const TUTORIAL_VERSION = "custom-nodes-v3";

const HomePage: React.FC = () => {
  // Prefix for label/input id pairs, unique per component instance.
  const fieldId = useId();
  const [workflows, setWorkflows] = useState<WorkflowDescriptor[]>([]);
  const [loading, setLoading] = useState(true);
  // Failing to load the library replaces the page with a retry state; failed
  // actions (create, delete, ...) only show a toast and keep the page usable.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  // The action currently waiting on the backend, to disable its controls.
  const [pendingAction, setPendingAction] = useState<string | null>(null);
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
    return localStorage.getItem(TUTORIAL_COMPLETED_KEY) !== TUTORIAL_VERSION;
  });

  const skipTutorial = () => {
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, TUTORIAL_VERSION);
    sessionStorage.removeItem(TUTORIAL_ACTIVE_KEY);
    sessionStorage.removeItem(TUTORIAL_STEP_KEY);
    setIsTutorialIntroVisible(false);
  };

  const startTutorial = () => {
    sessionStorage.setItem(TUTORIAL_ACTIVE_KEY, "true");
    sessionStorage.setItem(TUTORIAL_STEP_KEY, "0");
  };

  const retakeTutorial = () => {
    localStorage.removeItem(TUTORIAL_COMPLETED_KEY);
    sessionStorage.removeItem(TUTORIAL_ACTIVE_KEY);
    sessionStorage.removeItem(TUTORIAL_STEP_KEY);
    setIsTutorialIntroVisible(true);
  };

  const reportActionError = (message: string, err: unknown) => {
    console.error(err);
    const detail = getApiErrorMessage(err, "");
    setActionError(detail ? `${message} ${detail}` : message);
  };

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get("/workflows");
      setWorkflows(response.data);
      setLoadError(null);
    } catch (err) {
      console.error(err);
      setLoadError(getApiErrorMessage(err, "Unknown error"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // Focus the name field when a card enters edit mode.
  useEffect(() => {
    if (editingId) nameTextareaRef.current?.focus();
  }, [editingId]);

  // Grow the edit textareas to fit their text as it changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: editData is the resize trigger.
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
      reportActionError("Failed to update workflow.", err);
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
    if (pendingAction) return;
    setPendingAction(`duplicate:${id}`);
    try {
      const response = await api.post(`/workflows/${id}/duplicate`);
      navigate(`/workflow/${response.data._id}`);
    } catch (err) {
      reportActionError("Failed to duplicate workflow.", err);
    } finally {
      setPendingAction(null);
    }
  };

  const confirmDelete = async () => {
    if (!workflowToDelete) return;
    setPendingAction(`delete:${workflowToDelete}`);
    try {
      await api.delete(`/workflows/${workflowToDelete}`);
      setWorkflows((prev) => prev.filter((wf) => wf._id !== workflowToDelete));
    } catch (err) {
      reportActionError("Failed to delete workflow.", err);
    } finally {
      setPendingAction(null);
      setIsDeleteModalOpen(false);
      setWorkflowToDelete(null);
    }
  };

  const handleNewWorkflow = async () => {
    if (pendingAction) return;
    setPendingAction("create");
    try {
      const response = await api.post("/workflows", {
        name: "Untitled Workflow",
        nodes: [],
        edges: [],
        description: "",
        executionSettings: defaultExecutionSettings,
      });
      navigate(`/workflow/${response.data._id}`);
    } catch (err) {
      reportActionError("Failed to create new workflow.", err);
    } finally {
      setPendingAction(null);
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
      reportActionError("Failed to read import file.", err);
    }
  };

  const handleImportWorkflow = async () => {
    if (!importSource.trim()) {
      setActionError("Nextflow source is required for import.");
      return;
    }

    try {
      setIsImporting(true);
      // Parse the Nextflow source into a visual graph in the browser, then save
      // it through the normal create endpoint (no dedicated import endpoint).
      const draft = importNextflowWorkflow({
        name: importName.trim() || undefined,
        description: importDescription.trim() || undefined,
        rawSource: importSource,
        sourceKey: importFileName || undefined,
      });
      const response = await api.post("/workflows", draft);
      setIsImportModalOpen(false);
      resetImportForm();
      navigate(`/workflow/${response.data._id}`);
    } catch (err) {
      reportActionError("Failed to import workflow.", err);
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

  if (loading && workflows.length === 0) {
    return (
      <PageLayout>
        <output
          aria-live="polite"
          className="flex items-center justify-center h-screen"
        >
          <div className="text-text-light text-xl flex items-center gap-2">
            <Loader className="animate-spin text-nextflow-green" aria-hidden />
            <span className="text-nextflow-green">Loading workflows...</span>
          </div>
        </output>
      </PageLayout>
    );
  }

  if (loadError) {
    return (
      <PageLayout>
        <div className="flex min-h-screen items-center justify-center p-6">
          <div
            role="alert"
            className="w-full max-w-md rounded-lg border border-panel-border bg-panel-background p-6 text-text shadow-lg"
          >
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-warning" aria-hidden />
              <h1 className="text-lg font-semibold">
                Couldn&apos;t load your workflows
              </h1>
            </div>
            <p className="mt-3 text-sm text-text-light">
              {isDemoMode
                ? "The demo's browser storage could not be read."
                : "The N-WAVE backend did not respond. Make sure it is running (see the README) and try again."}
            </p>
            <p className="mt-2 text-xs text-text-light">Details: {loadError}</p>
            <button
              type="button"
              onClick={fetchWorkflows}
              disabled={loading}
              className="mt-5 inline-flex items-center gap-2 rounded-md bg-nextflow-green px-4 py-2 text-white hover:bg-nextflow-green-dark disabled:opacity-50"
            >
              <RefreshCw
                size={16}
                className={loading ? "animate-spin" : undefined}
                aria-hidden
              />
              {loading ? "Retrying..." : "Try again"}
            </button>
          </div>
        </div>
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
  const hasUserWorkflows = workflows.some(
    (wf) => !(wf._id === DEMO_WORKFLOW_ID || wf.isBuiltin)
  );

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
                type="button"
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
                  type="button"
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
                  type="button"
                  onClick={(e) => handleEditClick(e, wf)}
                  className="p-1 text-text-light hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Edit"
                >
                  <Pencil size={16} />
                </button>
              )}
              {showDuplicate && (
                <button
                  type="button"
                  onClick={(e) => handleDuplicate(e, wf._id)}
                  disabled={pendingAction !== null}
                  className={`p-1 text-text-light hover:text-white transition-opacity disabled:cursor-wait ${
                    pendingAction === `duplicate:${wf._id}`
                      ? "opacity-100"
                      : "opacity-0 group-hover:opacity-100"
                  }`}
                  aria-label="Duplicate"
                >
                  {pendingAction === `duplicate:${wf._id}` ? (
                    <Loader size={16} className="animate-spin" aria-hidden />
                  ) : (
                    <Copy size={16} />
                  )}
                </button>
              )}
              {!isReadOnly && (
                <button
                  type="button"
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
            <p className="text-sm leading-5 text-text-light mt-2 whitespace-pre-wrap h-[76px] overflow-y-auto p-2">
              {wf.description || (
                <span className="text-gray-500 italic">No description</span>
              )}
            </p>
            <div className="h-5 px-2 pt-1 text-xs text-gray-400">
              {isReadOnly ? "Read-only demo" : ""}
            </div>
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
          <div
            className="fixed inset-0 z-20 bg-nextflow-green-dark/40"
            aria-hidden="true"
          />
        )}
        <div className="flex-1 p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-3xl font-bold text-text">Workflows</h1>
            <div className="flex flex-wrap items-center gap-3">
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
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-accent px-4 py-2 text-sm font-medium text-nextflow-green hover:bg-accent transition-colors"
              >
                <Upload size={16} />
                <span>Import Workflow</span>
              </button>
            </div>
          </div>
          {!hasUserWorkflows && (
            <p className="mb-6 max-w-2xl text-sm text-text-light">
              You haven&apos;t created any workflows yet. Start a new one, import
              an existing Nextflow script
              {hasDemoWorkflow ? ", or open the demo workflow to learn the basics" : ""}
              .
            </p>
          )}
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
            <button
              type="button"
              onClick={handleNewWorkflow}
              disabled={pendingAction !== null}
              className="flex min-h-[10rem] items-center justify-center p-6 bg-transparent border-2 border-dashed border-accent rounded-lg text-nextflow-green hover:bg-accent transition-colors disabled:cursor-wait disabled:opacity-70"
            >
              {pendingAction === "create" ? (
                <Loader size={24} className="animate-spin" aria-hidden />
              ) : (
                <Plus size={24} aria-hidden />
              )}
              <span className="ml-2">
                {pendingAction === "create" ? "Creating..." : "New Workflow"}
              </span>
            </button>
          </div>
        </div>
        {actionError && (
          <Toast
            message={actionError}
            type="error"
            onClose={() => setActionError(null)}
          />
        )}
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
                type="button"
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
                type="button"
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
              <label htmlFor={`${fieldId}-name`} className="mb-1 block text-sm text-text">Name</label>
              <input
                id={`${fieldId}-name`}
                type="text"
                value={importName}
                onChange={(e) => setImportName(e.target.value)}
                className="w-full rounded-md border border-gray-600 bg-accent p-2 text-text focus:border-nextflow-green focus:outline-none"
                placeholder="Imported Nextflow Workflow"
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-description`} className="mb-1 block text-sm text-text">Description</label>
              <textarea
                id={`${fieldId}-description`}
                value={importDescription}
                onChange={(e) => setImportDescription(e.target.value)}
                className="w-full rounded-md border border-gray-600 bg-accent p-2 text-text focus:border-nextflow-green focus:outline-none"
                rows={2}
                placeholder="Optional description"
              />
            </div>
            <div>
              <label htmlFor={`${fieldId}-nextflow-file`} className="mb-1 block text-sm text-text">
                Nextflow File
              </label>
              <div className="flex gap-2">
                <input
                  id={`${fieldId}-nextflow-file`}
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
              <label htmlFor={`${fieldId}-nextflow-source`} className="mb-1 block text-sm text-text">
                Nextflow Source
              </label>
              <textarea
                id={`${fieldId}-nextflow-source`}
                value={importSource}
                onChange={(e) => setImportSource(e.target.value)}
                className="min-h-[220px] w-full rounded-md border border-gray-600 bg-accent p-2 font-mono text-sm text-text focus:border-nextflow-green focus:outline-none"
                placeholder="Paste a Nextflow workflow here or load a .nf file."
              />
            </div>
          </div>
        </Modal>
        <footer className="relative z-30 border-t border-accent/60 bg-background px-8 py-4 text-xs text-text-light">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
            <div className="flex shrink-0 items-center gap-3">
              <a
                href="https://hcistudio.org"
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-md bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
              >
                <img
                  src={hcistudioLogo}
                  alt="HCIstudio"
                  className="h-8 w-auto"
                />
              </a>
              <a
                href="https://fonda.hu-berlin.de"
                target="_blank"
                rel="noreferrer"
                className="shrink-0 rounded-md bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md"
              >
                <img src={fondaLogo} alt="FONDA" className="h-8 w-auto" />
              </a>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
              <span>v{buildInfo.version}</span>
              <span>Built {buildInfo.displayBuildDate}</span>
              <a
                href="https://hcistudio.org/impressum/"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:text-text hover:underline"
              >
                Legal Notice
              </a>
              <a
                href="https://hcistudio.org/datenschutz/"
                target="_blank"
                rel="noreferrer"
                className="underline-offset-2 hover:text-text hover:underline"
              >
                Privacy Policy
              </a>
              <span>
                {isDemoMode && "Hosted on GitHub Pages:"}
                <a
                  href="https://github.com/HCIstudio/N-WAVE"
                  target="_blank"
                  rel="noreferrer"
                  className="underline-offset-2 hover:text-text hover:underline"
                >
                  View Source
                </a>
              </span>
            </div>
          </div>
        </footer>
      </div>
    </PageLayout>
  );
};

export default HomePage;
