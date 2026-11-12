import type React from "react";
import { useState, useRef, useEffect, useCallback, useId } from "react";
import { Link, useNavigate } from "react-router";
import {
  AlertTriangle,
  CircleHelp,
  BookOpen,
  Copy,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Signpost,
  Trash2,
  Upload,
} from "lucide-react";
import api, { isDemoMode } from "../api";
import {
  ConfirmDialog,
  ActionDialog,
  Toast,
  type ActionButtonProps,
} from "../components/common";
import { getApiErrorMessage } from "../utils/errors";
import PageLayout from "../components/layout/PageLayout";
import { buildInfo } from "../utils/buildInfo";
import { Loader } from "lucide-react";
import type { WorkflowDescriptor } from "../types/backend";
import { DEFAULT_EXECUTION_SETTINGS } from "./workflow/executionSettings";
import hcistudioLogo from "../assets/hcistudio-logo.png";
import NodeKindLegend from "../components/common/workflow/NodeKindLegend";
import RunsOverview from "./home/RunsOverview";
import ImportWorkflowDialog from "./home/ImportWorkflowDialog";
import { useFeature } from "../settings/useFeatures";
import { WORKFLOW_TEMPLATES } from "../templates/workflowTemplates";
import { useRunsOverview } from "./home/useRunsOverview";
import NeedsInstall from "../components/common/ui/NeedsInstall";
import type { RunSummary } from "../api/runs";
import NewWorkflowDialog, {
  type NewWorkflowChoice,
} from "../components/common/workflow/NewWorkflowDialog";
import WorkflowPreview, {
  countNodes,
} from "../components/common/workflow/WorkflowPreview";
import fondaLogo from "../assets/fonda-logo.png";
import {
  nameForEditing,
  nameFromEditing,
  UNTITLED_WORKFLOW,
} from "../utils/workflowName";
import HomeTutorial, { HOME_TUTORIAL_STEPS } from "./home/HomeTutorial";
import {
  restartTutorial,
  setTutorialStep,
  tutorialDone,
  tutorialStep,
} from "../components/tutorial/tutorialState";

const DEMO_WORKFLOW_ID = "builtin:demo-basic";

const HEADER_BUTTON = "inline-flex items-center gap-2 rounded-lg border border-accent px-4 py-2 text-sm font-medium text-nextflow-green hover:bg-accent transition-colors";
const FOOTER_LINK = "underline-offset-2 hover:text-text hover:underline";
const LOGO_LINK = "shrink-0 rounded-md bg-white px-3 py-2 shadow-sm ring-1 ring-black/5 transition-shadow hover:shadow-md";

const REVEAL_ON_HOVER = "opacity-0 group-hover:opacity-100 transition-opacity";

const PILL_CLASS =
  "rounded-full bg-background px-2 py-0.5 text-xs text-text-light";

/** "3 days ago", for when a workflow was last edited. */
const formatRelativeTime = (iso: string): string => {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  if (!Number.isFinite(seconds)) return "";
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
  ];
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return "just now";
};

/** How a workflow's last run went, on its card. */
const LAST_RUN_STYLES: Record<RunSummary["status"], { dot: string; label: string }> = {
  running: { dot: "bg-yellow-400 animate-pulse", label: "Running now" },
  succeeded: { dot: "bg-green-500", label: "succeeded" },
  failed: { dot: "bg-red-500", label: "failed" },
  cancelled: { dot: "bg-gray-400", label: "cancelled" },
  unknown: { dot: "bg-gray-400", label: "ended" },
};

const LastRunPill: React.FC<{ run: RunSummary }> = ({ run }) => {
  const style = LAST_RUN_STYLES[run.status];
  const at = run.finishedAt ?? run.startedAt;
  return (
    <li
      className={`${PILL_CLASS} inline-flex items-center gap-1.5`}
      title={`Last run ${new Date(run.startedAt).toLocaleString()}: ${run.status}${run.message ? `. ${run.message}` : ""}`}
    >
      <span aria-hidden className={`h-2 w-2 rounded-full ${style.dot}`} />
      {run.status === "running" ? style.label : `Ran ${formatRelativeTime(at)}, ${style.label}`}
    </li>
  );
};

const HomePage: React.FC = () => {
  // Prefix for label/input id pairs, unique per component instance.
  const fieldId = useId();
  const [workflows, setWorkflows] = useState<WorkflowDescriptor[]>([]);
  const runsOverview = useRunsOverview();
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
  const [isNewWorkflowOpen, setIsNewWorkflowOpen] = useState(false);
  const nameTextareaRef = useRef<HTMLTextAreaElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editingCardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  // Global Settings → Features: without templates, no demos (and no tutorial,
  // which starts from one), and New Workflow starts empty.
  const templatesOn = useFeature("templates");
  const glossaryOn = useFeature("glossary");
  // The tutorial's home page tour: on the first visit, and when retaken.
  const [homeTutorialStep, setHomeTutorialStep] = useState<number | null>(() =>
    tutorialDone() ? null : (tutorialStep("home") ?? (tutorialStep("canvas") === null ? 0 : null)),
  );
  const retakeTutorial = () => {
    restartTutorial();
    setHomeTutorialStep(0);
  };
  /** The tour's last step: the user's own copy of Demo 1, where the tutorial goes on. */
  const duplicateDemoForTutorial = async () => {
    setTutorialStep("canvas", 0);
    try {
      const response = await api.post(`/workflows/${DEMO_WORKFLOW_ID}/duplicate`);
      navigate(`/workflow/${response.data._id}`);
    } catch (err) {
      setTutorialStep("home", HOME_TUTORIAL_STEPS.length - 1);
      reportActionError("Failed to duplicate the demo.", err);
    }
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
    const resizeTextarea = (ref: React.RefObject<HTMLTextAreaElement | null>) => {
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
    const data = {
      name: nameForEditing(wf.name || ""),
      description: wf.description || "",
    };
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
      const saved = { ...editData, name: nameFromEditing(editData.name) };
      await api.put(`/workflows/${id}`, saved);
      setWorkflows((prev) =>
        prev.map((wf) => (wf._id === id ? { ...wf, ...saved } : wf))
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

  const handleNewWorkflow = async (choice: NewWorkflowChoice) => {
    if (pendingAction) return;
    setPendingAction(
      choice.kind === "template"
        ? `create:template:${choice.template.id}`
        : `create:copy:${choice.workflow._id}`
    );
    try {
      // A demo is copied as it is; a template becomes a workflow of its own.
      const response =
        choice.kind === "copy"
          ? await api.post(`/workflows/${choice.workflow._id}/duplicate`)
          : await api.post("/workflows", {
              name:
                choice.template.id === "empty"
                  ? UNTITLED_WORKFLOW
                  : choice.template.name,
              nodes: choice.template.nodes,
              edges: choice.template.edges,
              description:
                choice.template.id === "empty"
                  ? ""
                  : choice.template.description,
              executionSettings: DEFAULT_EXECUTION_SETTINGS,
            });
      navigate(`/workflow/${response.data._id}`);
    } catch (err) {
      reportActionError("Failed to create new workflow.", err);
    } finally {
      setPendingAction(null);
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

  const hasDemoWorkflow = templatesOn && workflows.some((wf) => wf._id === DEMO_WORKFLOW_ID);
  const isHomeTutorialActive = homeTutorialStep !== null && hasDemoWorkflow;
  const isBuiltinWorkflow = (wf: WorkflowDescriptor) =>
    wf._id === DEMO_WORKFLOW_ID || Boolean(wf.isBuiltin);
  const builtinWorkflows = templatesOn ? workflows.filter(isBuiltinWorkflow) : [];
  const startNewWorkflow = () => {
    const empty = WORKFLOW_TEMPLATES.find((template) => template.id === "empty");
    if (!templatesOn && empty) {
      void handleNewWorkflow({ kind: "template", template: empty });
      return;
    }
    setIsNewWorkflowOpen(true);
  };
  const userWorkflows = workflows.filter((wf) => !isBuiltinWorkflow(wf));
  const hasUserWorkflows = userWorkflows.length > 0;

  const renderWorkflowCard = (wf: WorkflowDescriptor) => {
    const isEditing = editingId === wf._id;
    const isReadOnly = wf.isReadOnly || wf.origin?.readOnly;
    const showDuplicate = Boolean(wf.origin?.canDuplicate);
    const isDemoWorkflow = wf._id === DEMO_WORKFLOW_ID;
    // Built-in demos change with each release of N-WAVE.
    const changedAt =
      wf.updatedAt ?? (isBuiltinWorkflow(wf) ? buildInfo.buildDate : undefined);
    const lastRun = runsOverview.lastRuns.get(wf._id);
    const isDuplicating = pendingAction === `duplicate:${wf._id}`;

    const cardContent = (
      <>
        {/* The buttons sit over the preview: they get a backdrop of their own
            whenever they show. */}
        <div
          className={`absolute top-4 right-2 z-10 flex items-center gap-1 rounded-md border border-transparent transition-colors group-hover:border-panel-border group-hover:bg-panel-background group-hover:shadow-sm ${
            isDuplicating
              ? "border-panel-border bg-panel-background shadow-sm"
              : ""
          }`}
        >
          {isEditing ? (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSave(wf._id);
              }}
              className="p-1 text-text-light hover:text-white"
              aria-label="Save"
            >
              <Save size={16} />
            </button>
          ) : (
            !isReadOnly && (
              <button
                type="button"
                onClick={(e) => handleEditClick(e, wf)}
                className={`p-1 text-text-light hover:text-white ${REVEAL_ON_HOVER}`}
                aria-label="Edit"
              >
                <Pencil size={16} />
              </button>
            )
          )}
          {!isEditing && showDuplicate && (
            <button
              type="button"
              onClick={(e) => handleDuplicate(e, wf._id)}
              disabled={pendingAction !== null}
              className={`p-1 text-text-light hover:text-white transition-opacity disabled:cursor-wait ${
                isDuplicating ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
              aria-label="Duplicate"
            >
              {isDuplicating ? <Loader size={16} className="animate-spin" aria-hidden /> : <Copy size={16} />}
            </button>
          )}
          {!isReadOnly && (
            <button
              type="button"
              onClick={(e) => handleDeleteClick(e, wf._id)}
              className={`p-1 text-text-light hover:text-red-500 ${isEditing ? "" : REVEAL_ON_HOVER}`}
              aria-label="Delete"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
        {isEditing ? (
          <>
            <div className="pr-12">
              <textarea
                ref={nameTextareaRef}
                value={editData.name}
                placeholder={UNTITLED_WORKFLOW}
                aria-label="Workflow name"
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
            <WorkflowPreview nodes={wf.nodes ?? []} edges={wf.edges ?? []} />
            <h2 className="mt-3 line-clamp-2 pr-16 text-lg font-semibold text-nextflow-green">
              {wf.name}
            </h2>
            <p className="mt-1 line-clamp-3 min-h-[3.75rem] text-sm leading-5 text-text-light">
              {wf.description || (
                <span className="text-gray-500 italic">No description</span>
              )}
            </p>
            <ul
              aria-label="About this workflow"
              className="mt-auto flex flex-wrap gap-1.5 pt-3"
            >
              <li className={PILL_CLASS}>
                {countNodes(wf.nodes ?? [])}{" "}
                {countNodes(wf.nodes ?? []) === 1 ? "node" : "nodes"}
              </li>
              {isReadOnly && <li className={PILL_CLASS}>Read-only</li>}
              {changedAt && (
                <li
                  className={PILL_CLASS}
                  title={new Date(changedAt).toLocaleString()}
                >
                  Changed {formatRelativeTime(changedAt)}
                </li>
              )}
              {lastRun && <LastRunPill run={lastRun} />}
            </ul>
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
        data-tutorial={isDemoWorkflow ? "demo-1" : undefined}
        className={`group relative flex flex-col bg-accent rounded-lg shadow-sm hover:shadow-md transition-shadow p-4 ${
          isDemoWorkflow && homeTutorialStep === HOME_TUTORIAL_STEPS.length - 1
            ? "ring-2 ring-sky-400 ring-offset-2 ring-offset-background"
            : ""
        }`}
      >
        {cardContent}
      </Link>
    );
  };

  return (
    <PageLayout>
      <div className="min-h-screen flex flex-col">
        <div className="flex-1 p-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-text">Workflows</h1>
              <NodeKindLegend className="mt-2" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {!isHomeTutorialActive && templatesOn && (
                <button
                  type="button"
                  onClick={retakeTutorial}
                  className={HEADER_BUTTON}
                >
                  Retake Tutorial
                </button>
              )}
              <a
                href="https://github.com/HCIstudio/N-WAVE/wiki"
                target="_blank"
                rel="noreferrer"
                data-tutorial="help"
                className={HEADER_BUTTON}
              >
                <BookOpen size={16} />
                <span>Wiki</span>
              </a>
              {glossaryOn && (
                <Link
                  to="/help"
                  className={HEADER_BUTTON}
                >
                  <CircleHelp size={16} aria-hidden />
                  <span>Help</span>
                </Link>
              )}
              <Link
                to="/roadmap"
                title="Where N-WAVE is going"
                className={HEADER_BUTTON}
              >
                <Signpost size={16} aria-hidden />
                <span>Roadmap</span>
              </Link>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                data-tutorial="import"
                className={HEADER_BUTTON}
              >
                <Upload size={16} />
                <span>Import Workflow</span>
              </button>
              <Link
                to="/settings"
                data-tutorial="settings"
                className={HEADER_BUTTON}
              >
                <Settings size={16} aria-hidden />
                <span>Global Settings</span>
              </Link>
            </div>
          </div>
          {isHomeTutorialActive && homeTutorialStep !== null && (
            <HomeTutorial
              step={homeTutorialStep}
              onStep={setHomeTutorialStep}
              onDuplicateDemo={() => void duplicateDemoForTutorial()}
            />
          )}

          {builtinWorkflows.length > 0 && (
            <section aria-labelledby={`${fieldId}-examples`} className="mb-10">
              <h2
                id={`${fieldId}-examples`}
                data-tutorial="demos"
                className="w-fit text-xl font-semibold text-text"
              >
                Built-in demos
              </h2>
              <p className="mb-4 mt-1 max-w-3xl text-sm text-text-light">
                Three read-only examples, from simple text processing to a
                complete nf-core pipeline, and that pipeline rebuilt node by
                node. Open one to explore it; duplicate it to make your own
                editable copy.
              </p>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {builtinWorkflows.map((wf) => renderWorkflowCard(wf))}
              </div>
            </section>
          )}

          <section aria-labelledby={`${fieldId}-own`}>
            <h2 id={`${fieldId}-own`} data-tutorial="own" className="w-fit text-xl font-semibold text-text">
              Your workflows
            </h2>
            {!hasUserWorkflows && (
              <p className="mt-1 max-w-3xl text-sm text-text-light">
                You haven&apos;t created any workflows yet. Start a new one
                {templatesOn
                  ? ", import an existing Nextflow script, or duplicate a demo."
                  : " or import an existing Nextflow script."}
              </p>
            )}
            <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {userWorkflows.map((wf) => renderWorkflowCard(wf))}
              <button
                type="button"
                onClick={startNewWorkflow}
                data-tutorial="new-workflow"
                disabled={pendingAction !== null}
                className="flex min-h-[12rem] items-center justify-center p-6 bg-transparent border-2 border-dashed border-accent rounded-lg text-nextflow-green hover:bg-accent transition-colors disabled:cursor-wait disabled:opacity-70"
              >
                <Plus size={24} aria-hidden />
                <span className="ml-2">New Workflow</span>
              </button>
            </div>
          </section>

          <NeedsInstall>
            <RunsOverview
              runs={runsOverview.runs}
              running={runsOverview.running}
              onStopAll={runsOverview.stopAll}
            />
          </NeedsInstall>
        </div>
        {actionError && (
          <Toast
            message={actionError}
            type="error"
            onClose={() => setActionError(null)}
          />
        )}
        <NewWorkflowDialog
          isOpen={isNewWorkflowOpen}
          onClose={() => {
            if (!pendingAction) setIsNewWorkflowOpen(false);
          }}
          demos={builtinWorkflows}
          onChoose={handleNewWorkflow}
          pendingKey={
            pendingAction?.startsWith("create:")
              ? pendingAction.slice("create:".length)
              : null
          }
        />
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
        <ImportWorkflowDialog
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onError={(message, error) => (error === undefined ? setActionError(message) : reportActionError(message, error))}
        />
        <footer className="relative z-30 border-t border-accent/60 bg-background px-8 py-4 text-xs text-text-light">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
            <div className="flex shrink-0 items-center gap-3">
              <a
                href="https://hcistudio.org"
                target="_blank"
                rel="noreferrer"
                className={LOGO_LINK}
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
                className={LOGO_LINK}
              >
                <img src={fondaLogo} alt="FONDA" className="h-8 w-auto" />
              </a>
            </div>
            <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-1">
              <span>v{buildInfo.version}</span>
              <span>Built {buildInfo.displayBuildDate}</span>
              <Link to="/references" className={FOOTER_LINK}>
                References
              </Link>
              <a
                href="https://hcistudio.org/impressum/"
                target="_blank"
                rel="noreferrer"
                className={FOOTER_LINK}
              >
                Legal Notice
              </a>
              <a
                href="https://hcistudio.org/datenschutz/"
                target="_blank"
                rel="noreferrer"
                className={FOOTER_LINK}
              >
                Privacy Policy
              </a>
              <span>
                {isDemoMode && "Hosted on GitHub Pages: "}
                <a
                  href="https://github.com/HCIstudio/N-WAVE"
                  target="_blank"
                  rel="noreferrer"
                  className={FOOTER_LINK}
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
