import type React from "react";
import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router";
import {
  Home,
  Save,
  Check,
  Download,
  Loader,
  Play,
  Settings,
  Container,
  FolderDown,
  Hourglass,
} from "lucide-react";
import { ConfirmDialog } from "../common";
import ExecutionSettingsComponent from "../common/workflow/ExecutionSettings";
import type { ExecutionSettings } from "../../types/execution";

interface BottomBarProps {
  workflowName: string;
  onWorkflowNameChange: (newName: string) => void;
  onSave: () => void;
  onDownload: () => void;
  /** Download a runnable project (zip with modules, config and inputs). */
  onExportProject?: () => void;
  isExporting?: boolean;
  onRun?: (settings: ExecutionSettings) => void;
  isSaved: boolean;
  isSaving: boolean;
  isRunning?: boolean;
  /** Why the workflow can't run yet (from the workflow check), or null. */
  runBlockedReason?: string | null;
  /** The workflow check, shown before the Run button. */
  checkControl?: React.ReactNode;
  isLoading?: boolean; // Whether the workflow is being loaded
  executionSettings: ExecutionSettings;
  onExecutionSettingsChange: (settings: ExecutionSettings) => void;
  /** Open the run panel: the running workflow's steps and log. */
  onShowRuns?: () => void;
  /**
   * The Resume switch on the Run button, a setting of the next run: with a
   * cache from earlier runs, the run reuses the steps that haven't changed.
   * Off (greyed) while there is no cache.
   */
  resume?: { available: boolean; on: boolean; onChange: (on: boolean) => void };
  /** More sections at the end of the execution settings (the run cache). */
  settingsExtra?: React.ReactNode;
}

const BottomBar: React.FC<BottomBarProps> = ({
  workflowName,
  onWorkflowNameChange,
  onSave,
  onDownload,
  onExportProject,
  isExporting = false,
  onRun,
  isSaved,
  isSaving,
  isRunning = false,
  runBlockedReason = null,
  checkControl,
  isLoading = false,
  executionSettings,
  onExecutionSettingsChange,
  onShowRuns,
  resume,
  settingsExtra,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(workflowName);
  const [showExecutionSettings, setShowExecutionSettings] = useState(false);
  const [settingsChanged, setSettingsChanged] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  // Home while a run goes: ask first (the run goes on without the page).
  const [confirmLeave, setConfirmLeave] = useState(false);
  const navigate = useNavigate();
  const modalRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Focus the name field when it switches into edit mode.
  useEffect(() => {
    if (isEditingName) nameInputRef.current?.focus();
  }, [isEditingName]);

  // Load settings from localStorage on component mount
  useEffect(() => {
    // Only load from localStorage if no settings are provided from parent
    // This prevents overriding settings loaded from the backend
    if (!executionSettings || Object.keys(executionSettings).length === 0) {
      const savedSettings = localStorage.getItem("executionSettings");
      if (savedSettings) {
        try {
          const parsed = JSON.parse(savedSettings);
          // Merge with default settings to ensure all required properties exist
          onExecutionSettingsChange({
            ...parsed,
            container: {
              ...parsed.container,
            },
            resources: {
              ...parsed.resources,
            },
            output: {
              ...parsed.output,
            },
            nextflow: {
              ...parsed.nextflow,
            },
            errorHandling: {
              ...parsed.errorHandling,
            },
            environment: {
              ...parsed.environment,
            },
            cleanup: {
              ...parsed.cleanup,
            },
            validation: {
              ...parsed.validation,
            },
          });
          setSettingsSaved(true);
        } catch (error) {
          console.error("Failed to load execution settings:", error);
        }
      }
    }
  }, [onExecutionSettingsChange, executionSettings]);

  // Handle click outside to close modal
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // A dialog opened from the settings (e.g. "make an editable copy")
      // is on top of them; clicks there aren't clicks outside.
      const inOtherDialog = (event.target as Element | null)?.closest?.("dialog");
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node) &&
        !inOtherDialog
      ) {
        if (settingsChanged && !settingsSaved) {
          // Show confirmation dialog for unsaved changes
          setShowConfirmDialog(true);
          return;
        }
        setShowExecutionSettings(false);
      }
    };

    if (showExecutionSettings) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showExecutionSettings, settingsChanged, settingsSaved]);

  const handleNameDoubleClick = () => {
    setTempName(workflowName);
    setIsEditingName(true);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTempName(e.target.value);
  };

  const handleNameSubmit = () => {
    if (tempName !== workflowName) {
      onWorkflowNameChange(tempName);
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleNameSubmit();
      onSave();
    } else if (e.key === "Escape") {
      setIsEditingName(false); // Revert changes
    }
  };

  const handleNameBlur = () => {
    handleNameSubmit();
  };

  const handleRun = () => {
    if (onRun) {
      onRun(executionSettings);
    }
  };

  const handleSettingsChange = (newSettings: Partial<ExecutionSettings>) => {
    onExecutionSettingsChange({ ...executionSettings, ...newSettings });
    setSettingsChanged(true);
    setSettingsSaved(false);
    // Save to localStorage immediately for global sync
    try {
      localStorage.setItem(
        "executionSettings",
        JSON.stringify({ ...executionSettings, ...newSettings })
      );
    } catch (error) {
      console.error(
        "Failed to save execution settings to localStorage:",
        error
      );
    }
  };

  const handleSaveSettings = () => {
    try {
      localStorage.setItem(
        "executionSettings",
        JSON.stringify(executionSettings)
      );
      setSettingsSaved(true);
      setSettingsChanged(false);
    } catch (error) {
      console.error("Failed to save execution settings:", error);
    }
  };

  const handleRunAndClose = () => {
    if (onRun) {
      // Auto-save settings before running
      if (settingsChanged || !settingsSaved) {
        handleSaveSettings();
      }
      onRun(executionSettings);
      setShowExecutionSettings(false);
    }
  };

  return (
    <>
      {/* Execution Settings Modal */}
      {showExecutionSettings && (
        // Above the run panel (z-50), which stays open beside the canvas.
        <div className="fixed inset-0 bg-overlay flex items-center justify-center z-[60]">
          <div
            ref={modalRef}
            className="bg-panel-background rounded-lg shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] overflow-hidden border border-panel-border flex flex-col"
          >
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-panel-border bg-panel-background">
              <h2 className="text-xl font-semibold text-text">
                Execution Settings
              </h2>
              <div className="flex items-center gap-3">
                {/* Save Settings Button */}
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={settingsSaved}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors text-sm ${
                    settingsSaved
                      ? "text-nextflow-green border border-nextflow-green/30 bg-nextflow-green/10"
                      : "text-text-light border border-panel-border hover:bg-accent"
                  } disabled:opacity-50`}
                >
                  {settingsSaved ? (
                    <>
                      <Check className="w-3 h-3" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-3 h-3" />
                      Save
                    </>
                  )}
                </button>

                {/* Close Button */}
                <button
                  type="button"
                  onClick={() => {
                    if (settingsChanged && !settingsSaved) {
                      setShowConfirmDialog(true);
                      return;
                    }
                    setShowExecutionSettings(false);
                  }}
                  className="text-text-light hover:text-text transition-colors p-1 hover:bg-accent rounded"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              <ExecutionSettingsComponent
                settings={executionSettings}
                onSettingsChange={handleSettingsChange}
              />
              {settingsExtra}
            </div>

            {/* Footer */}
            <div className="border-t border-panel-border bg-background p-4">
              <div className="flex justify-between items-center">
                <div className="text-sm text-text-light">
                  <div>
                    <span className="font-medium text-text">
                      {executionSettings.runProfile
                        ? `Profile ${executionSettings.runProfile}`
                        : `${executionSettings.container?.enabled ? "Docker" : "Local"} execution`}
                    </span>
                    {executionSettings.container?.enabled && (
                      <span className="ml-2">
                        {executionSettings.container?.defaultImage}
                      </span>
                    )}
                    <span className="ml-2">
                      • {executionSettings.resources?.maxCpus || 1} CPU cores,{" "}
                      {executionSettings.resources?.maxMemory || "2.GB"}
                    </span>
                    <span className="ml-2">
                      •{" "}
                      {executionSettings.resources?.maxTime
                        ? `${executionSettings.resources.maxTime} timeout`
                        : "server default timeout"}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span>
                      Output: {executionSettings.output?.directory || "results"}
                    </span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (settingsChanged && !settingsSaved) {
                        setShowConfirmDialog(true);
                        return;
                      }
                      setShowExecutionSettings(false);
                    }}
                    className="px-4 py-2 text-text-light border border-panel-border rounded-md hover:bg-accent transition-colors"
                  >
                    Close
                  </button>
                  {onRun && (
                    <button
                      type="button"
                      onClick={handleRunAndClose}
                      disabled={isRunning || runBlockedReason !== null}
                      className="px-4 py-2 text-white bg-nextflow-green hover:bg-nextflow-green/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      title={
                        runBlockedReason
                          ? runBlockedReason
                          : isRunning
                          ? "Workflow is currently running"
                          : "Run workflow"
                      }
                    >
                      {isRunning ? (
                        <>
                          <Loader className="w-4 h-4 animate-spin" />
                          Running...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Run Workflow
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background text-text rounded-lg border border-accent flex items-center justify-between p-1 space-x-2 shadow-lg z-10"
        data-tutorial-bottom-bar
      >
        <Link
          to="/"
          onClick={(event) => {
            if (!isRunning) return;
            event.preventDefault();
            setConfirmLeave(true);
          }}
          className="p-1.5 text-text hover:bg-accent rounded-md transition-colors"
          aria-label="Home"
        >
          <Home className="w-4 h-4" />
        </Link>

        <div className="flex-grow text-center">
          {isEditingName ? (
            <input
              type="text"
              value={tempName}
              onChange={handleNameChange}
              onKeyDown={handleNameKeyDown}
              onBlur={handleNameBlur}
              className="bg-accent text-sm text-text text-center rounded-md p-0.5 outline-none w-32 focus:ring-1 focus:ring-nextflow-green"
              ref={nameInputRef}
            />
          ) : (
            <button
              type="button"
              onDoubleClick={handleNameDoubleClick}
              title="Double-click to rename"
              className="px-2 py-0.5 cursor-pointer text-sm"
            >
              {isLoading ? "Loading..." : workflowName || "Untitled Workflow"}
            </button>
          )}
        </div>

        {/* Execution Settings Button */}
        <button
          type="button"
          onClick={() => setShowExecutionSettings(true)}
          className="p-1.5 text-text hover:bg-accent rounded-md transition-colors relative"
          aria-label="Execution Settings"
          title={
            executionSettings.container?.enabled
              ? `Docker: ${executionSettings.container?.defaultImage}`
              : "Local execution"
          }
        >
          {executionSettings.container?.enabled ? (
            <Container className="w-4 h-4 text-blue-600" />
          ) : (
            <Settings className="w-4 h-4" />
          )}
        </button>

        {checkControl}

        {/* Run, with its Resume switch: a setting of the run, not an action.
            While a run goes, the button shows the hourglass and brings the
            run panel back. */}
        {onRun && (
          <div className="inline-flex items-stretch overflow-hidden rounded-md ring-1 ring-nextflow-green/50">
            {isRunning ? (
              <button
                type="button"
                onClick={onShowRuns}
                className="inline-flex items-center gap-1.5 bg-nextflow-green px-2 py-1.5 text-xs font-medium text-white hover:bg-nextflow-green/90"
                aria-label="Show the running workflow"
                title="The workflow is running. Click to show its progress."
              >
                <Hourglass className="h-4 w-4 animate-pulse" aria-hidden />
                Running
              </button>
            ) : (
              <button
                type="button"
                onClick={handleRun}
                disabled={runBlockedReason !== null}
                className="p-1.5 text-white bg-nextflow-green hover:bg-nextflow-green/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Run Workflow"
                title={
                  runBlockedReason
                    ? runBlockedReason
                    : `${
                        executionSettings.runProfile
                          ? `Run through the profile "${executionSettings.runProfile}"`
                          : executionSettings.container?.enabled
                            ? "Run with Docker"
                            : "Run locally"
                      }${resume?.on ? ", resuming the last run" : ""}`
                }
              >
                <Play className="w-4 h-4" />
              </button>
            )}
            {resume && (
              <button
                type="button"
                role="switch"
                aria-checked={resume.on}
                aria-label="Resume"
                disabled={!resume.available || isRunning}
                onClick={() => resume.onChange(!resume.on)}
                className={`inline-flex items-center gap-1.5 border-l border-nextflow-green/40 px-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  resume.on
                    ? "bg-nextflow-green/10 font-medium text-nextflow-green"
                    : "bg-background text-text-light hover:bg-accent"
                }`}
                title={
                  !resume.available
                    ? "Resume: a run reuses the steps an earlier run of this workflow finished. Nothing to reuse yet."
                    : resume.on
                      ? "Resume is on: the next run reuses the steps whose code and inputs haven't changed. Click to run every step."
                      : "Resume is off: the next run runs every step. Click to reuse the steps the last run finished."
                }
              >
                <span
                  aria-hidden
                  className={`relative h-3 w-5 rounded-full transition-colors ${
                    resume.on ? "bg-nextflow-green" : "bg-gray-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all ${
                      resume.on ? "left-2.5" : "left-0.5"
                    }`}
                  />
                </span>
                Resume
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={onDownload}
          className="p-1.5 text-text hover:bg-accent rounded-md transition-colors"
          aria-label="Download Workflow"
          title="Download the Nextflow script"
        >
          <Download className="w-4 h-4" />
        </button>

        {onExportProject && (
          <button
            type="button"
            onClick={onExportProject}
            disabled={isExporting}
            className="p-1.5 text-text hover:bg-accent rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Export Project"
            title="Export a runnable project (script, config, modules and inputs)"
          >
            {isExporting ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <FolderDown className="w-4 h-4" />
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onSave}
          disabled={isSaving || isSaved}
          className="p-1.5 text-text hover:bg-accent rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Save Workflow"
        >
          {isSaving ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : isSaved ? (
            <Check className="w-4 h-4 text-nextflow-green" />
          ) : (
            <Save className="w-4 h-4" />
          )}
        </button>
      </div>

      <ConfirmDialog
        isOpen={confirmLeave}
        variant="primary"
        title="A run is going"
        message="The run goes on when you leave this page. Open this workflow again to follow it, or stop it from the run list on the home page."
        confirmText="Leave"
        cancelText="Stay"
        onConfirm={() => {
          setConfirmLeave(false);
          navigate("/");
        }}
        onClose={() => setConfirmLeave(false)}
      />

      {/* Confirmation Dialog for Unsaved Changes */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        variant="primary"
        title="Unsaved Changes"
        message="You have unsaved changes to your execution settings. Would you like to save them before closing?"
        confirmText="Save & Close"
        cancelText="Close Without Saving"
        onConfirm={() => {
          handleSaveSettings();
          setShowConfirmDialog(false);
          setShowExecutionSettings(false);
        }}
        onClose={() => {
          setShowConfirmDialog(false);
          setShowExecutionSettings(false);
        }}
      />
    </>
  );
};

export default BottomBar;
