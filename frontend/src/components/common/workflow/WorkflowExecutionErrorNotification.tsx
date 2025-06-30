import type React from "react";
import { useState, useEffect } from "react";
import {
  AlertTriangle,
  RefreshCw,
  X,
  Lightbulb,
  Terminal,
  FileX,
  Settings,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface ExecutionError {
  message: string;
  output?: string;
  code?: string | number;
}

interface WorkflowExecutionErrorNotificationProps {
  isVisible: boolean;
  onClose: () => void;
  onRetry: () => Promise<void>;
  error: ExecutionError;
}

const WorkflowExecutionErrorNotification: React.FC<
  WorkflowExecutionErrorNotificationProps
> = ({ isVisible, onClose, onRetry, error }) => {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [isExpanded, setIsExpanded] = useState(true);
  const [isSlideIn, setIsSlideIn] = useState(false);
  const [retrySuccess, setRetrySuccess] = useState(false);

  useEffect(() => {
    if (isVisible) {
      setIsSlideIn(true);
      setIsExpanded(true);
      // Reset retry state when a new error appears
      if (!isRetrying) {
        setRetryAttempt(0);
      }
    } else {
      setIsSlideIn(false);
    }
  }, [isVisible, isRetrying]);

  const handleRetry = async () => {
    setIsRetrying(true);
    setRetryAttempt((prev) => prev + 1);
    setRetrySuccess(false); // Reset success state

    // Add a small delay to ensure UI updates are visible
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      await onRetry();
      // Success! Show success feedback briefly before closing
      setRetrySuccess(true);
      setIsExpanded(true); // Expand to show success message
      setTimeout(() => {
        onClose(); // Close notification after showing success
      }, 2000);
    } catch (retryError) {
      console.error("Retry failed:", retryError);
      // Keep expanded to show error details after failed retry
      // Suggestions will repopulate automatically when error prop updates
      setRetrySuccess(false);
      setIsExpanded(true);
    } finally {
      setIsRetrying(false);
    }
  };

  const getSuggestedFixes = (errorMessage: string): string[] => {
    const suggestions: string[] = [];
    const lowerError = errorMessage.toLowerCase();

    if (
      lowerError.includes("no such file") ||
      lowerError.includes("file not found")
    ) {
      suggestions.push(
        "Verify that all input files are properly uploaded and selected"
      );
      suggestions.push("Check file paths in your File Input nodes");
    }

    if (
      lowerError.includes("permission denied") ||
      lowerError.includes("access denied")
    ) {
      suggestions.push("Check file permissions on input/output directories");
      suggestions.push(
        "Verify that the execution environment has write access"
      );
    }

    if (lowerError.includes("memory") || lowerError.includes("out of memory")) {
      suggestions.push("Increase memory allocation in execution settings");
      suggestions.push("Consider processing smaller datasets");
    }

    if (lowerError.includes("docker") || lowerError.includes("container")) {
      suggestions.push("Verify Docker is installed and running");
      suggestions.push("Check container image name and version");
    }

    if (
      lowerError.includes("command not found") ||
      lowerError.includes("executable")
    ) {
      suggestions.push(
        "Check that required tools are installed in the environment"
      );
      suggestions.push("Verify container image contains necessary software");
      suggestions.push("Review script commands for typos");
    }

    if (
      lowerError.includes("syntax error") ||
      lowerError.includes("invalid syntax")
    ) {
      suggestions.push("Review Nextflow script syntax");
      suggestions.push("Check for missing semicolons or brackets");
      suggestions.push("Validate process and channel definitions");
    }

    if (lowerError.includes("connection") || lowerError.includes("network")) {
      suggestions.push("Check network connectivity");
      suggestions.push("Verify server is running and accessible");
      suggestions.push("Review firewall and proxy settings");
    }

    if (suggestions.length === 0) {
      suggestions.push("Review workflow configuration and node settings");
      suggestions.push("Check the execution logs for more details");
      suggestions.push("Verify all required parameters are set");
      suggestions.push("Try executing with different settings or smaller data");
    }

    return suggestions;
  };

  const getErrorIcon = (errorMessage: string) => {
    const lowerError = errorMessage.toLowerCase();

    if (lowerError.includes("file") || lowerError.includes("directory")) {
      return <FileX className="w-5 h-5 text-red-400 flex-shrink-0" />;
    }
    if (lowerError.includes("docker") || lowerError.includes("container")) {
      return <Settings className="w-5 h-5 text-red-400 flex-shrink-0" />;
    }
    if (lowerError.includes("script") || lowerError.includes("command")) {
      return <Terminal className="w-5 h-5 text-red-400 flex-shrink-0" />;
    }

    return <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />;
  };

  const suggestions = getSuggestedFixes(error.message);

  if (!isVisible) return null;

  return (
    <div
      className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-40 transition-all duration-300 ease-out w-full max-w-2xl ${
        isSlideIn ? "translate-y-0" : "-translate-y-full"
      }`}
    >
      <div className="bg-panel-background/95 backdrop-blur-sm border-2 border-red-500/70 rounded-lg shadow-lg shadow-red-500/20 mx-4">
        <div className="px-4 py-3">
          {/* Header - Always visible */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {getErrorIcon(error.message)}
              <div className="flex-1">
                <h3 className="font-semibold text-text text-sm">
                  {retrySuccess
                    ? "Workflow Executed Successfully!"
                    : isRetrying
                    ? "Retrying Workflow Execution..."
                    : "Workflow Execution Failed"}
                </h3>
                {isRetrying && retryAttempt > 0 && (
                  <p className="text-text-light text-xs">
                    Attempt {retryAttempt}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {!isRetrying && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="p-1 text-text-light hover:text-text transition-colors"
                  title={isExpanded ? "Collapse details" : "Expand details"}
                >
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
              )}

              <button
                onClick={onClose}
                className="p-1 text-text-light hover:text-text transition-colors"
                disabled={isRetrying}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Expandable Content */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              isExpanded ? "max-h-96 opacity-100 mt-3" : "max-h-0 opacity-0"
            }`}
          >
            <div className="space-y-3">
              {/* Success Status - Show when retry succeeds */}
              {retrySuccess && (
                <div className="bg-green-900/20 border border-green-500/40 rounded p-3">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                      <div className="w-2 h-2 bg-white rounded-full" />
                    </div>
                    <p className="text-green-100 text-sm font-medium">
                      Retry successful! Workflow executed without errors.
                    </p>
                  </div>
                  <p className="text-green-200 text-xs mt-1">
                    The notification will close automatically.
                  </p>
                </div>
              )}

              {/* Retry Status - Show prominently when retrying */}
              {isRetrying && (
                <div className="bg-nextflow-green/20 border border-nextflow-green/40 rounded p-3">
                  <div className="flex items-center space-x-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-nextflow-green" />
                    <p className="text-green-100 text-sm font-medium">
                      Retrying workflow execution... (Attempt {retryAttempt})
                    </p>
                  </div>
                  <p className="text-green-200 text-xs mt-1">
                    Please wait while we attempt to execute the workflow again.
                  </p>
                </div>
              )}

              {/* Error Message - Hide when retry succeeds */}
              {!retrySuccess && (
                <div className="bg-background border border-red-500/50 rounded p-3">
                  <p className="text-text text-sm leading-relaxed">
                    {error.message}
                  </p>
                </div>
              )}

              {/* Output Section */}
              {error.output && (
                <div className="space-y-2">
                  <h4 className="font-medium text-text text-sm flex items-center space-x-2">
                    <Terminal className="w-3 h-3" />
                    <span>Execution Output</span>
                  </h4>
                  <div className="bg-background border border-panel-border rounded p-2 max-h-24 overflow-y-auto">
                    <pre className="text-xs text-text-light whitespace-pre-wrap font-mono">
                      {error.output}
                    </pre>
                  </div>
                </div>
              )}

              {/* Suggested Fixes - Hide when retry succeeds or during retry */}
              {!retrySuccess && !isRetrying && (
                <div className="space-y-2">
                  <h4 className="font-medium text-text text-sm flex items-center space-x-2">
                    <Lightbulb className="w-3 h-3 text-nextflow-green" />
                    <span>Suggested Fixes</span>
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {suggestions.slice(0, 4).map((suggestion, index) => (
                      <div
                        key={index}
                        className="flex items-start space-x-2 p-2 bg-nextflow-green/10 border border-nextflow-green/20 rounded text-xs"
                      >
                        <div className="w-1 h-1 bg-nextflow-green rounded-full mt-1.5 flex-shrink-0" />
                        <p className="text-text leading-relaxed">
                          {suggestion}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom section with Retry button */}
          <div className="flex justify-start pt-3 border-t border-panel-border mt-3">
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="px-4 py-2 text-sm rounded bg-nextflow-green hover:bg-nextflow-green-dark text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              {isRetrying ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Retrying...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Retry</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowExecutionErrorNotification;
