import type React from "react";
import { useState, useEffect } from "react";
import {
  CheckCircle,
  XCircle,
  Settings,
  RefreshCw,
  Container,
  FolderOpen,
  Cpu,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  HelpCircle,
  UploadCloud,
} from "lucide-react";
import { MemoryInput } from "../forms";

interface DockerStatus {
  dockerAvailable: boolean;
  version?: string;
  error?: string;
  details?: string;
}

interface NextflowStatus {
  nextflowAvailable: boolean;
  dockerNextflowAvailable: boolean;
  version?: string;
  error?: string;
  note?: string;
}

export interface ExecutionSettings {
  useDocker: boolean;
  containerImage: string;
  outputDirectory: string;
  outputNaming: string;
  maxCpus: number;
  maxMemory: string;
  executionTimeout: number;
  errorStrategy: string;
  publishMode: string;
  cleanupOnFailure: boolean;
  nextflowVersion?: string;
  output?: {
    directory: string;
    namingPattern: string;
  };
}

interface ExecutionSettingsProps {
  settings: ExecutionSettings;
  onSettingsChange: (settings: Partial<ExecutionSettings>) => void;
}

const ExecutionSettingsComponent: React.FC<ExecutionSettingsProps> = ({
  settings,
  onSettingsChange,
}) => {
  const [dockerStatus, setDockerStatus] = useState<DockerStatus | null>(null);
  const [nextflowStatus, setNextflowStatus] = useState<NextflowStatus | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("execution");
  const [showDirectoryHelp, setShowDirectoryHelp] = useState(false);

  const checkStatus = async () => {
    setLoading(true);
    try {
      const [dockerResponse, nextflowResponse] = await Promise.all([
        fetch("/api/execute/docker-status"),
        fetch("/api/execute/nextflow-status"),
      ]);

      const dockerData = await dockerResponse.json();
      const nextflowData = await nextflowResponse.json();

      setDockerStatus(dockerData);
      setNextflowStatus(nextflowData);
    } catch (error) {
      console.error("Failed to check system status:", error);
      setDockerStatus({
        dockerAvailable: false,
        error: "Failed to check Docker status",
      });
      setNextflowStatus({
        nextflowAvailable: false,
        dockerNextflowAvailable: false,
        error: "Failed to check Nextflow status",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const commonContainerImages = [
    { value: "ubuntu:22.04", label: "Ubuntu 22.04 (Recommended)" },
    { value: "ubuntu:20.04", label: "Ubuntu 20.04" },
    { value: "python:3.11", label: "Python 3.11" },
    { value: "python:3.10", label: "Python 3.10" },
    { value: "python:3.9", label: "Python 3.9" },
    { value: "r-base:latest", label: "R Base Environment" },
    {
      value: "biocontainers/samtools:latest",
      label: "SAMtools (Bioinformatics)",
    },
    { value: "biocontainers/bwa:latest", label: "BWA Aligner" },
    { value: "biocontainers/fastqc:latest", label: "FastQC Quality Control" },
  ];

  const errorStrategies = [
    { value: "terminate", label: "Terminate on first error (Recommended)" },
    { value: "ignore", label: "Ignore errors and continue" },
    { value: "retry", label: "Retry failed tasks" },
    { value: "finish", label: "Finish running tasks then stop" },
  ];

  const memoryOptions = [
    "1 GB",
    "2 GB",
    "4 GB",
    "5 GB",
    "8 GB",
    "16 GB",
    "32 GB",
    "64 GB",
    "128 GB",
  ];

  const tabs = [
    { id: "execution", label: "Execution", icon: Settings },
    { id: "output", label: "Output", icon: FolderOpen },
    { id: "resources", label: "Resources", icon: Cpu },
    { id: "advanced", label: "Advanced", icon: AlertTriangle },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "execution":
        return (
          <div className="space-y-6">
            {/* Docker Configuration */}
            <div className="border border-panel-border rounded-lg p-4 bg-panel-background">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Container className="w-4 h-4 text-nextflow-green" />
                  <h4 className="text-sm font-medium text-text">
                    Container Execution
                  </h4>
                </div>
                <button
                  onClick={checkStatus}
                  disabled={loading}
                  className="p-1 hover:bg-accent rounded disabled:opacity-50 transition-colors"
                  title="Refresh status"
                >
                  <RefreshCw
                    className={`w-3 h-3 text-text-light ${
                      loading ? "animate-spin" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Docker Toggle */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <label className="text-sm text-text font-medium">
                    Enable Docker/Container execution
                  </label>
                  <p className="text-xs text-text-light mt-1">
                    {settings.useDocker
                      ? "Processes run in isolated Docker containers (slower, maximum reproducibility)"
                      : "Processes run locally in the host system (faster, less isolated)"}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.useDocker}
                    onChange={(e) =>
                      onSettingsChange({ useDocker: e.target.checked })
                    }
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-accent peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-nextflow-green/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-nextflow-green"></div>
                </label>
              </div>

              {/* Container Image Selection */}
              {settings.useDocker && (
                <div className="space-y-3">
                  <label className="block text-sm text-text font-medium">
                    Default Container Image
                  </label>
                  <select
                    value={settings.containerImage}
                    onChange={(e) =>
                      onSettingsChange({ containerImage: e.target.value })
                    }
                    className="w-full px-3 py-2 text-sm bg-background border border-panel-border rounded-md text-text focus:outline-none focus:ring-1 focus:ring-nextflow-green focus:border-nextflow-green"
                  >
                    {commonContainerImages.map((image) => (
                      <option
                        key={image.value}
                        value={image.value}
                        className="bg-background text-text"
                      >
                        {image.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={settings.containerImage}
                    onChange={(e) =>
                      onSettingsChange({ containerImage: e.target.value })
                    }
                    placeholder="Or enter custom container image..."
                    className="w-full px-3 py-2 text-sm bg-background border border-panel-border rounded-md text-text placeholder-text-light focus:outline-none focus:ring-1 focus:ring-nextflow-green focus:border-nextflow-green"
                  />
                  <div className="text-xs text-text-light">
                    <p className="mb-1">Popular bioinformatics containers:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>biocontainers/samtools - SAM/BAM file processing</li>
                      <li>biocontainers/bwa - DNA sequence alignment</li>
                      <li>
                        biocontainers/fastqc - Quality control for sequencing
                        data
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Status Information */}
              <div className="space-y-2 mt-4 pt-4 border-t border-panel-border">
                <div className="flex items-center gap-2 text-xs">
                  {loading ? (
                    <RefreshCw className="w-3 h-3 text-text-light animate-spin" />
                  ) : dockerStatus?.dockerAvailable ? (
                    <CheckCircle className="w-3 h-3 text-nextflow-green" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-400" />
                  )}
                  <span className="text-text-light">
                    Docker:{" "}
                    {loading
                      ? "Checking..."
                      : dockerStatus?.dockerAvailable
                      ? "Available"
                      : "Not Available"}
                    {dockerStatus?.version && ` (${dockerStatus.version})`}
                  </span>
                </div>

                {/* Docker Error Details */}
                {!dockerStatus?.dockerAvailable && dockerStatus?.error && (
                  <div className="ml-5 p-2 bg-accent/30 border border-red-400/50 rounded text-xs text-text">
                    <div className="font-medium text-red-600">
                      {dockerStatus.error}
                    </div>
                    {dockerStatus.details && (
                      <div className="mt-1 text-text-light">
                        {dockerStatus.details}
                      </div>
                    )}
                    {dockerStatus.error === "Docker Desktop not running" && (
                      <div className="mt-2 text-text">
                        <strong className="text-nextflow-green">
                          💡 To fix this:
                        </strong>
                        <ol className="list-decimal list-inside ml-2 mt-1 text-text-light">
                          <li>Launch Docker Desktop from your Start menu</li>
                          <li>
                            Wait for Docker to start (green whale icon in system
                            tray)
                          </li>
                          <li>Refresh this page to check status again</li>
                        </ol>
                      </div>
                    )}
                  </div>
                )}

                {/* Status Explanation */}
                {!loading && (
                  <div className="ml-5 p-2 bg-panel-background border border-panel-border rounded text-xs text-text-light">
                    {dockerStatus?.dockerAvailable &&
                    nextflowStatus?.nextflowAvailable ? (
                      <div>
                        <div className="text-nextflow-green font-medium">
                          ✅ Optimal Setup
                        </div>
                        <div className="mt-1">
                          Both Docker and local Nextflow are available. You can
                          use either execution mode.
                        </div>
                      </div>
                    ) : dockerStatus?.dockerAvailable &&
                      nextflowStatus?.dockerNextflowAvailable ? (
                      <div>
                        <div className="text-nextflow-green font-medium">
                          ✅ Docker Setup
                        </div>
                        <div className="mt-1">
                          Docker is available, Nextflow will run via Docker
                          container. This works well for most workflows.
                        </div>
                      </div>
                    ) : !dockerStatus?.dockerAvailable &&
                      !nextflowStatus?.nextflowAvailable &&
                      !nextflowStatus?.dockerNextflowAvailable ? (
                      <div>
                        <div className="text-red-600 font-medium">
                          ❌ No Execution Environment
                        </div>
                        <div className="mt-1">
                          Neither Docker nor Nextflow are available. Install
                          Docker Desktop or local Nextflow from{" "}
                          <span className="text-nextflow-green">
                            nextflow.io
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-yellow-600 font-medium">
                          ⚠️ Limited Setup
                        </div>
                        <div className="mt-1">
                          Consider installing both Docker and Nextflow for the
                          best experience.
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs">
                  {loading ? (
                    <RefreshCw className="w-3 h-3 text-text-light animate-spin" />
                  ) : nextflowStatus?.nextflowAvailable ||
                    nextflowStatus?.dockerNextflowAvailable ? (
                    <CheckCircle className="w-3 h-3 text-nextflow-green" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-400" />
                  )}
                  <span className="text-text-light">
                    Nextflow:{" "}
                    {loading
                      ? "Checking..."
                      : nextflowStatus?.nextflowAvailable
                      ? "Available (Local)"
                      : nextflowStatus?.dockerNextflowAvailable
                      ? "Available (Docker)"
                      : "Not Available"}
                    {nextflowStatus?.version && ` (${nextflowStatus.version})`}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );

      case "output":
        return (
          <div className="space-y-6">
            {/* Output Directory */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Output Directory
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.output?.directory ?? ""}
                  onChange={(e) =>
                    onSettingsChange({
                      output: {
                        directory: e.target.value.replace(/\\/g, "/"),
                        namingPattern:
                          settings.output?.namingPattern ||
                          "{workflow_name}_{timestamp}",
                      },
                    })
                  }
                  placeholder="results"
                  className="flex-1 px-3 py-2 bg-background border border-panel-border rounded-md text-text placeholder-text-light focus:outline-none focus:ring-1 focus:ring-nextflow-green focus:border-nextflow-green"
                />
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      // Try the File System Access API with better error handling
                      if ("showDirectoryPicker" in window) {
                        try {
                          const directoryHandle = await (
                            window as any
                          ).showDirectoryPicker({
                            mode: "readwrite",
                            startIn: "downloads", // Start in a safe location
                          });

                          // Try to get a more meaningful path representation
                          // Note: Full path access is limited by browser security
                          const selectedPath =
                            directoryHandle.name === "."
                              ? "Downloads"
                              : directoryHandle.name;
                          onSettingsChange({
                            output: {
                              directory: selectedPath.replace(/\\/g, "/"),
                              namingPattern:
                                settings.output?.namingPattern ||
                                "{workflow_name}_{timestamp}",
                            },
                          });

                          // Store the actual handle for later use (if needed)
                          (window as any).selectedDirectoryHandle =
                            directoryHandle;

                          // Show success feedback
                          alert(
                            `✅ Directory selected: ${selectedPath}\n\nNote: Due to browser security, you can only select user folders (Downloads, Documents, etc.). To save anywhere, type the full path manually.`
                          );
                        } catch (fsError: any) {
                          if (fsError.name === "AbortError") {
                            // User cancelled, do nothing
                            return;
                          } else if (
                            fsError.name === "NotAllowedError" ||
                            fsError.message.includes("system files")
                          ) {
                            // Show helpful error message for system folder blocking
                            showSystemFolderError();
                          } else {
                            console.warn(
                              "File System Access API failed:",
                              fsError
                            );
                            fallbackToManualInput();
                          }
                        }
                      } else {
                        fallbackToManualInput();
                      }
                    } catch (error) {
                      console.log(
                        "Directory selection cancelled or failed:",
                        error
                      );
                      fallbackToManualInput();
                    }

                    function showSystemFolderError() {
                      const result = confirm(
                        `🚫 Can't access system folder\n\n` +
                          `Chrome blocks access to system folders (C:\\, Program Files, etc.) for security.\n\n` +
                          `Solutions:\n` +
                          `1. Click OK to enter the path manually\n` +
                          `2. Choose a user folder (Downloads, Documents, Desktop)\n\n` +
                          `Click OK to enter path manually, or Cancel to try again.`
                      );

                      if (result) {
                        fallbackToManualInput();
                      }
                    }

                    function fallbackToManualInput() {
                      const userPath = prompt(
                        "💾 Enter the full path where you want to save results:\n\n" +
                          "Examples:\n" +
                          "• C:\\MyProjects\\Results\n" +
                          "• D:\\Data\\Outputs\n" +
                          "• C:\\Users\\YourName\\Desktop\\Results\n\n" +
                          "💡 Tip: You can save anywhere with manual paths!",
                        "C:\\Results"
                      );
                      if (userPath && userPath.trim()) {
                        onSettingsChange({
                          output: {
                            directory: userPath.trim().replace(/\\/g, "/"),
                            namingPattern:
                              settings.output?.namingPattern ||
                              "{workflow_name}_{timestamp}",
                          },
                        });
                      }
                    }
                  }}
                  className="px-3 py-2 border border-panel-border rounded-md hover:bg-accent flex items-center gap-1 text-text-light hover:text-text transition-colors"
                  title="Browse for directory (user folders only) or enter any path manually"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-text-light mt-2">
                Directory where workflow outputs will be saved. Use absolute
                paths (e.g., C:\Results) or relative paths (e.g., results).
              </p>

              {/* Directory Access Help - Collapsible */}
              <div className="mt-3">
                <button
                  onClick={() => setShowDirectoryHelp(!showDirectoryHelp)}
                  className="flex items-center gap-2 text-sm text-nextflow-green hover:text-nextflow-green/80 transition-colors"
                  type="button"
                >
                  <HelpCircle className="w-4 h-4" />
                  Need help saving to custom directories?
                  {showDirectoryHelp ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </button>

                {showDirectoryHelp && (
                  <div className="mt-2 p-3 bg-panel-background border border-panel-border rounded-md">
                    <div className="text-xs text-text space-y-2">
                      <div className="font-medium text-nextflow-green">
                        💡 Want to save results anywhere on your computer?
                      </div>
                      <div className="space-y-2">
                        <div>
                          <strong className="text-text">
                            Method 1 - Manual Path:
                          </strong>{" "}
                          Type the full path directly (e.g.,{" "}
                          <code className="bg-accent px-1 rounded text-text-light">
                            C:\MyProjects\Results
                          </code>
                          )
                        </div>
                        <div>
                          <strong className="text-text">
                            Method 2 - Use Downloads Folder:
                          </strong>
                          <div className="ml-2 mt-1 text-text-light">
                            Use the folder picker to select your Downloads
                            folder, then manually specify the full path if
                            needed.
                          </div>
                        </div>
                        <div className="text-text-light bg-accent/50 p-2 rounded">
                          <strong className="text-text">
                            Browser Limitation:
                          </strong>{" "}
                          Modern browsers restrict file system access for
                          security. For full control over output location, use
                          Method 1 (manual path entry).
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Output Naming Pattern */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Output Naming Pattern
              </label>
              <input
                type="text"
                value={settings.output?.namingPattern ?? ""}
                onChange={(e) =>
                  onSettingsChange({
                    output: {
                      directory: settings.output?.directory || "results",
                      namingPattern: e.target.value,
                    },
                  })
                }
                placeholder="{workflow_name}_{timestamp}"
                className="w-full px-3 py-2 bg-background border border-panel-border rounded-md text-text placeholder-text-light focus:outline-none focus:ring-1 focus:ring-nextflow-green focus:border-nextflow-green"
              />
              <p className="text-xs text-text-light mt-2">
                Naming pattern for output files. Available variables:{" "}
                <span className="text-nextflow-green">{"{workflow_name}"}</span>
                , <span className="text-nextflow-green">{"{timestamp}"}</span>,{" "}
                <span className="text-nextflow-green">{"{date}"}</span>,{" "}
                <span className="text-nextflow-green">{"{process_name}"}</span>
              </p>
            </div>
          </div>
        );

      case "resources":
        return (
          <div className="space-y-6">
            {/* CPU Limits */}
            <div>
              <label className="block text-sm font-medium text-text mb-3">
                Maximum CPU Cores
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="32"
                  value={settings.maxCpus}
                  onChange={(e) =>
                    onSettingsChange({ maxCpus: Number.parseInt(e.target.value) })
                  }
                  className="flex-1 h-2 bg-accent rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #00A878 0%, #00A878 ${
                      ((settings.maxCpus - 1) / 31) * 100
                    }%, #3A3A3A ${
                      ((settings.maxCpus - 1) / 31) * 100
                    }%, #3A3A3A 100%)`,
                  }}
                />
                <span className="text-sm font-medium text-nextflow-green bg-panel-background px-3 py-1 rounded-md min-w-[3rem] text-center">
                  {settings.maxCpus}
                </span>
              </div>
              <p className="text-xs text-text-light mt-2">
                Maximum number of CPU cores that can be used by any single
                process.
              </p>
            </div>

            {/* Memory Limits */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Maximum Memory
              </label>
              <MemoryInput
                value={settings.maxMemory}
                onChange={(val) => onSettingsChange({ maxMemory: val })}
                className="w-full px-3 py-2 bg-background border border-panel-border rounded-md text-text focus:outline-none focus:ring-1 focus:ring-nextflow-green focus:border-nextflow-green"
              />
              <p className="text-xs text-text-light mt-2">
                Maximum amount of memory that can be used by any single process.
              </p>
            </div>

            {/* Execution Timeout */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Execution Timeout (minutes)
              </label>
              <input
                type="number"
                min="0"
                max="1440"
                value={settings.executionTimeout}
                onChange={(e) =>
                  onSettingsChange({
                    executionTimeout: Number.parseInt(e.target.value) || 0,
                  })
                }
                placeholder="0 = no timeout"
                className="w-full px-3 py-2 bg-background border border-panel-border rounded-md text-text placeholder-text-light focus:outline-none focus:ring-1 focus:ring-nextflow-green focus:border-nextflow-green"
              />
              <p className="text-xs text-text-light mt-2">
                Maximum time the workflow can run before being terminated. Set
                to 0 for no timeout.
              </p>
            </div>
          </div>
        );

      case "advanced":
        return (
          <div className="space-y-6">
            {/* Nextflow Version */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Nextflow Version
              </label>
              <select
                value={settings.nextflowVersion || "25.04.4"}
                onChange={(e) =>
                  onSettingsChange({ nextflowVersion: e.target.value })
                }
                className="w-full px-3 py-2 bg-background border border-panel-border rounded-md text-text focus:outline-none focus:ring-1 focus:ring-nextflow-green focus:border-nextflow-green"
              >
                <option value="25.04.4">25.04.4 (Latest Stable)</option>
                <option value="24.04.4">24.04.4 (LTS)</option>
                <option value="23.10.1">23.10.1</option>
                <option value="23.04.4">23.04.4</option>
                <option value="22.10.8">22.10.8</option>
              </select>
              <p className="text-xs text-text-light mt-2">
                Select the Nextflow version to use for execution. 25.04.4 is
                recommended for most workflows.
              </p>
            </div>

            {/* Error Strategy */}
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Error Handling Strategy
              </label>
              <select
                value={settings.errorStrategy}
                onChange={(e) =>
                  onSettingsChange({ errorStrategy: e.target.value })
                }
                className="w-full px-3 py-2 bg-background border border-panel-border rounded-md text-text focus:outline-none focus:ring-1 focus:ring-nextflow-green focus:border-nextflow-green"
              >
                {errorStrategies.map((strategy) => (
                  <option
                    key={strategy.value}
                    value={strategy.value}
                    className="bg-background text-text"
                  >
                    {strategy.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-text-light mt-2">
                How the workflow should behave when a process fails.
              </p>
            </div>

            {/* Cleanup on Failure */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <label className="text-sm font-medium text-text">
                  Cleanup on Failure
                </label>
                <p className="text-xs text-text-light mt-1">
                  Remove work directories when processes fail to save disk space
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer ml-4">
                <input
                  type="checkbox"
                  checked={settings.cleanupOnFailure}
                  onChange={(e) =>
                    onSettingsChange({ cleanupOnFailure: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-accent peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-nextflow-green/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-nextflow-green"></div>
              </label>
            </div>

            {/* Warning Messages */}
            {(dockerStatus?.error || nextflowStatus?.error) && (
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded-md">
                <h4 className="text-sm font-medium text-red-400 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  System Issues Detected:
                </h4>
                {dockerStatus?.error && (
                  <p className="text-sm text-red-300 mb-1">
                    Docker: {dockerStatus.error}
                  </p>
                )}
                {nextflowStatus?.error && (
                  <p className="text-sm text-red-300">
                    Nextflow: {nextflowStatus.error}
                  </p>
                )}
              </div>
            )}

            {settings.useDocker && !dockerStatus?.dockerAvailable && (
              <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded-md">
                <p className="text-sm text-yellow-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Docker execution is enabled but Docker is not available.
                  Workflows may fail to execute.
                </p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-panel-background text-text">
      {/* Tab Navigation */}
      <div className="border-b border-panel-border mb-6">
        <nav className="flex space-x-6">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-nextflow-green text-nextflow-green"
                    : "border-transparent text-text-light hover:text-text hover:border-accent"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="min-h-[400px]">{renderTabContent()}</div>
    </div>
  );
};

export default ExecutionSettingsComponent;
