import type React from "react";
import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Home,
  Save,
  Check,
  Download,
  Loader,
  Play,
  Settings,
  Container,
} from "lucide-react";
import { ConfirmationDialog } from "../common";
import ExecutionSettingsComponent from "../common/workflow/ExecutionSettings";
import type { ExecutionSettings } from "../../types/execution";

interface BottomBarProps {
  workflowName: string;
  onWorkflowNameChange: (newName: string) => void;
  onSave: () => void;
  onDownload: () => void;
  onRun?: (settings: ExecutionSettings) => void;
  isSaved: boolean;
  isSaving: boolean;
  isRunning?: boolean;
  canExecute?: boolean; // Whether the workflow can be executed (no missing files)
  isLoading?: boolean; // Whether the workflow is being loaded
  executionSettings: ExecutionSettings;
  onExecutionSettingsChange: (settings: ExecutionSettings) => void;
}

const BottomBar: React.FC<BottomBarProps> = ({
  workflowName,
  onWorkflowNameChange,
  onSave,
  onDownload,
  onRun,
  isSaved,
  isSaving,
  isRunning = false,
  canExecute = true,
  isLoading = false,
  executionSettings,
  onExecutionSettingsChange,
}) => {
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempName, setTempName] = useState(workflowName);
  const [showExecutionSettings, setShowExecutionSettings] = useState(false);
  const [settingsChanged, setSettingsChanged] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(true);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

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
      if (
        modalRef.current &&
        !modalRef.current.contains(event.target as Node)
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
      console.log("Execution settings saved");
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
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
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
                settings={executionSettings as any}
                onSettingsChange={handleSettingsChange as any}
              />
            </div>

            {/* Footer */}
            <div className="border-t border-panel-border bg-background p-4">
              <div className="flex justify-between items-center">
                <div className="text-sm text-text-light">
                  <div>
                    <span className="font-medium text-text">
                      {executionSettings.container?.enabled
                        ? "Docker"
                        : "Local"}{" "}
                      execution
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
                      • {executionSettings.resources?.maxTime || "PT30M"}{" "}
                      timeout
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
                      onClick={handleRunAndClose}
                      disabled={isRunning || !canExecute}
                      className="px-4 py-2 text-white bg-nextflow-green hover:bg-nextflow-green/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      title={
                        !canExecute
                          ? "Cannot run: Some files are missing content"
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

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background text-text rounded-lg border border-accent flex items-center justify-between p-1 space-x-2 shadow-lg z-10">
        <Link
          to="/"
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
              autoFocus
            />
          ) : (
            <div
              onDoubleClick={handleNameDoubleClick}
              className="px-2 py-0.5 cursor-pointer text-sm"
            >
              {isLoading ? "Loading..." : workflowName || "Untitled Workflow"}
            </div>
          )}
        </div>

        {/* Execution Settings Button */}
        <button
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

        {/* Run Button */}
        {onRun && (
          <button
            onClick={handleRun}
            disabled={isRunning || !canExecute}
            className="p-1.5 text-white bg-nextflow-green hover:bg-nextflow-green/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Run Workflow"
            title={
              !canExecute
                ? "Cannot run: Some files are missing content"
                : isRunning
                ? "Workflow is currently running"
                : executionSettings.container?.enabled
                ? "Run with Docker"
                : "Run locally"
            }
          >
            {isRunning ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
        )}

        <button
          onClick={onDownload}
          className="p-1.5 text-text hover:bg-accent rounded-md transition-colors"
          aria-label="Download Workflow"
        >
          <Download className="w-4 h-4" />
        </button>

        <button
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

      {/* Confirmation Dialog for Unsaved Changes */}
      <ConfirmationDialog
        isOpen={showConfirmDialog}
        title="Unsaved Changes"
        message="You have unsaved changes to your execution settings. Would you like to save them before closing?"
        confirmText="Save & Close"
        cancelText="Close Without Saving"
        onConfirm={() => {
          handleSaveSettings();
          setShowConfirmDialog(false);
          setShowExecutionSettings(false);
        }}
        onCancel={() => {
          setShowConfirmDialog(false);
          setShowExecutionSettings(false);
        }}
      />
    </>
  );
};

export default BottomBar;
