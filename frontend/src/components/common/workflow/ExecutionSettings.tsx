import type React from "react";
import { useCallback, useEffect, useId, useState } from "react";
import {
  CheckCircle,
  XCircle,
  Settings,
  RefreshCw,
  Container,
  FolderOpen,
  Cpu,
  AlertTriangle,
  Server,
} from "lucide-react";
import api from "../../../api";
import type { ExecutionSettings } from "../../../types/execution";
import {
  isoDurationToMinutes,
  minutesToIsoDuration,
} from "../../../utils/duration";
import Term from "../ui/Term";
import { availableRunProfiles, usesDefaultLimits } from "../../../settings/effectiveSettings";
import { useRunDefaults } from "../../../settings/useRunDefaults";
import { useFeature } from "../../../settings/useFeatures";
import { useServerLimits } from "../../../settings/useServerLimits";
import { formatMemory } from "../../../utils/memory";
import ResourceLimitsFields from "./ResourceLimitsFields";
import RunProfilePicker from "./RunProfilePicker";

/** The Global Settings page, opened in its own tab so the canvas stays as it is. */
const SETTINGS_URL = `${import.meta.env.BASE_URL}settings`;

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

/** The object-valued sections of the settings (everything but `mode`). */
type SettingsSection = Exclude<keyof ExecutionSettings, "mode">;

interface ExecutionSettingsProps {
  settings: ExecutionSettings;
  onSettingsChange: (settings: Partial<ExecutionSettings>) => void;
}

const INPUT =
  "w-full px-3 py-2 bg-background border border-panel-border rounded-md text-text placeholder-text-light focus:outline-none focus:ring-1 focus:ring-nextflow-green focus:border-nextflow-green";
const LABEL = "block text-sm font-medium text-text mb-2";
const HINT = "text-xs text-text-light mt-2";

/** Images offered for steps without a container of their own; any other can be typed. */
const CONTAINER_IMAGES = [
  "ubuntu:22.04",
  "ubuntu:20.04",
  "python:3.11",
  "r-base:latest",
  "biocontainers/samtools:latest",
  "biocontainers/bwa:latest",
  "biocontainers/fastqc:latest",
];

const ERROR_STRATEGIES = [
  { value: "terminate", label: "Stop the run at the first failed step (Nextflow's default)" },
  { value: "ignore", label: "Ignore failed steps; the rest goes on" },
  { value: "retry", label: "Retry a failed step once, then stop" },
  { value: "finish", label: "Let running steps finish, then stop" },
];

/** A setting that is on or off, as a switch, with what it does below its name. */
const Toggle: React.FC<{
  id: string;
  label: string;
  help: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ id, label, help, checked, onChange }) => (
  <div className="flex items-start justify-between gap-4">
    <div>
      <label htmlFor={id} className="text-sm font-medium text-text">
        {label}
      </label>
      <p className="mt-1 text-xs text-text-light">{help}</p>
    </div>
    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <div className="h-5 w-9 rounded-full bg-accent peer-checked:bg-nextflow-green peer-focus:ring-2 peer-focus:ring-nextflow-green/50 after:absolute after:left-[2px] after:top-[2px] after:h-4 after:w-4 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white" />
    </label>
  </div>
);

/** Whether Docker or Nextflow is available. */
const StatusLine: React.FC<{ loading: boolean; ok: boolean; text: string; label: string }> = ({
  loading,
  ok,
  text,
  label,
}) => (
  <div className="flex items-center gap-2">
    {loading ? (
      <RefreshCw className="h-3 w-3 animate-spin text-text-light" />
    ) : ok ? (
      <CheckCircle className="h-3 w-3 text-nextflow-green" />
    ) : (
      <XCircle className="h-3 w-3 text-red-400" />
    )}
    <span className="text-text-light">{loading ? `${label}: Checking...` : text}</span>
  </div>
);

const ExecutionSettingsComponent: React.FC<ExecutionSettingsProps> = ({
  settings,
  onSettingsChange,
}) => {
  // Each change replaces one nested section, keeping its other fields.
  const updateSection = <K extends SettingsSection>(
    section: K,
    patch: Partial<ExecutionSettings[K]>
  ) =>
    onSettingsChange({
      [section]: { ...(settings[section] as object), ...patch },
    } as Partial<ExecutionSettings>);
  const useDocker = settings.container?.enabled ?? false;
  // Prefix for label/input id pairs, unique per component instance.
  const fieldId = useId();
  const [dockerStatus, setDockerStatus] = useState<DockerStatus | null>(null);
  const [nextflowStatus, setNextflowStatus] = useState<NextflowStatus | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const serverLimits = useServerLimits();
  const { defaults: runDefaults, save: saveRunDefaults } = useRunDefaults();
  const runProfilesOn = useFeature("runProfiles");
  const useDefaultLimits = usesDefaultLimits(settings);
  // Profiles kept in the workflow from before go to the Settings page.
  const moveProfilesToDefaults = async () => {
    const own = settings.runProfiles ?? [];
    await saveRunDefaults({
      ...runDefaults,
      runProfiles: availableRunProfiles({ ...settings, runProfiles: own }, runDefaults),
    });
    onSettingsChange({ runProfiles: [] });
  };
  const [activeTab, setActiveTab] = useState<string>("execution");

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const [dockerResponse, nextflowResponse] = await Promise.all([
        api.get("/execute/docker-status"),
        api.get("/execute/nextflow-status"),
      ]);
      setDockerStatus(dockerResponse.data);
      setNextflowStatus(nextflowResponse.data);
    } catch (error) {
      console.error("Failed to check system status:", error);
      setDockerStatus({ dockerAvailable: false, error: "Failed to check Docker status" });
      setNextflowStatus({
        nextflowAvailable: false,
        dockerNextflowAvailable: false,
        error: "Failed to check Nextflow status",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const tabs = [
    { id: "execution", label: "Execution", icon: Settings },
    { id: "output", label: "Output", icon: FolderOpen },
    { id: "resources", label: "Resources", icon: Cpu },
    ...(runProfilesOn ? [{ id: "profiles", label: "Profiles", icon: Server }] : []),
    { id: "advanced", label: "Advanced", icon: AlertTriangle },
  ];

  const nextflowAvailable = nextflowStatus?.nextflowAvailable || nextflowStatus?.dockerNextflowAvailable;

  const renderTabContent = () => {
    switch (activeTab) {
      case "execution":
        return (
          <section className="space-y-4 rounded-lg border border-panel-border bg-panel-background p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Container className="h-4 w-4 text-nextflow-green" />
                <h4 className="text-sm font-medium text-text">Container Execution</h4>
                <Term id="container" />
                <Term id="docker" />
              </div>
              <button
                type="button"
                onClick={checkStatus}
                disabled={loading}
                className="rounded p-1 transition-colors hover:bg-accent disabled:opacity-50"
                title="Refresh status"
              >
                <RefreshCw className={`h-3 w-3 text-text-light ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>

            <Toggle
              id={`${fieldId}-use-docker`}
              label="Enable Docker/Container execution"
              help={
                useDocker
                  ? "Processes run in isolated Docker containers (slower, maximum reproducibility)"
                  : "Processes run locally in the host system (faster, less isolated)"
              }
              checked={useDocker}
              onChange={(enabled) => updateSection("container", { enabled })}
            />

            {useDocker && (
              <div>
                <label htmlFor={`${fieldId}-default-container-image`} className={LABEL}>
                  Default Container Image
                </label>
                <input
                  id={`${fieldId}-default-container-image`}
                  list={`${fieldId}-container-images`}
                  value={settings.container?.defaultImage ?? ""}
                  onChange={(e) => updateSection("container", { defaultImage: e.target.value })}
                  placeholder="ubuntu:22.04"
                  className={INPUT}
                />
                <datalist id={`${fieldId}-container-images`}>
                  {CONTAINER_IMAGES.map((image) => (
                    <option key={image} value={image} />
                  ))}
                </datalist>
                <p className={HINT}>
                  For steps without a container of their own; nf-core modules bring theirs.
                </p>
              </div>
            )}

            <div className="space-y-2 border-t border-panel-border pt-4 text-xs">
              <StatusLine
                loading={loading}
                ok={Boolean(dockerStatus?.dockerAvailable)}
                text={`Docker: ${dockerStatus?.dockerAvailable ? "Available" : "Not Available"}${dockerStatus?.version ? ` (${dockerStatus.version})` : ""}`}
                label="Docker"
              />
              {!dockerStatus?.dockerAvailable && dockerStatus?.error && (
                <div className="ml-5 rounded border border-red-400/50 bg-accent/30 p-2 text-text">
                  <p className="font-medium text-red-600">{dockerStatus.error}</p>
                  {dockerStatus.details && <p className="mt-1 text-text-light">{dockerStatus.details}</p>}
                  {dockerStatus.error === "Docker Desktop not running" && (
                    <p className="mt-1 text-text-light">Start Docker Desktop, wait until it runs, then refresh.</p>
                  )}
                </div>
              )}
              <StatusLine
                loading={loading}
                ok={Boolean(nextflowAvailable)}
                text={`Nextflow: ${
                  nextflowStatus?.nextflowAvailable
                    ? "Available (Local)"
                    : nextflowStatus?.dockerNextflowAvailable
                      ? "Available (Docker)"
                      : "Not Available"
                }${nextflowStatus?.version ? ` (${nextflowStatus.version})` : nextflowStatus?.note ? `: ${nextflowStatus.note}` : ""}`}
                label="Nextflow"
              />
              {!loading && !nextflowAvailable && nextflowStatus?.error && (
                <p className="ml-5 text-red-600">{nextflowStatus.error}</p>
              )}
            </div>
          </section>
        );

      case "output":
        return (
          <div className="space-y-6">
            <div>
              <label htmlFor={`${fieldId}-output-directory`} className={LABEL}>
                Output Directory
              </label>
              <input
                id={`${fieldId}-output-directory`}
                type="text"
                value={settings.output?.directory ?? ""}
                onChange={(e) =>
                  updateSection("output", {
                    directory: e.target.value.replace(/\\/g, "/"),
                    namingPattern: settings.output?.namingPattern || "{workflow_name}_{timestamp}",
                  })
                }
                placeholder="results"
                className={INPUT}
              />
              <p className={HINT}>
                Where each run gets its folder: <code>results</code> or a folder inside it (the{" "}
                <code>results</code> folder next to N-WAVE&apos;s <code>latest.yml</code>). A path on
                your computer, such as <code>C:\data</code>, can&apos;t be used.
              </p>
            </div>

            <div>
              <label htmlFor={`${fieldId}-output-naming-pattern`} className={LABEL}>
                Output Naming Pattern
              </label>
              <input
                id={`${fieldId}-output-naming-pattern`}
                type="text"
                value={settings.output?.namingPattern ?? ""}
                onChange={(e) =>
                  updateSection("output", {
                    directory: settings.output?.directory || "results",
                    namingPattern: e.target.value,
                  })
                }
                placeholder="{workflow_name}_{timestamp}"
                className={INPUT}
              />
              <p className={HINT}>
                The run folder&apos;s name. Available variables:{" "}
                <span className="text-nextflow-green">{"{workflow_name}"}</span>,{" "}
                <span className="text-nextflow-green">{"{timestamp}"}</span>,{" "}
                <span className="text-nextflow-green">{"{date}"}</span>
              </p>
            </div>
          </div>
        );

      case "resources":
        return (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <label htmlFor={`${fieldId}-use-default-limits`} className="text-sm font-medium text-text">
                  Use the global limits
                </label>
                <p className="mt-1 text-xs text-text-light">
                  {useDefaultLimits
                    ? `Runs get ${runDefaults.maxCpus} CPU cores, ${formatMemory(runDefaults.maxMemory)} of memory and ${
                        runDefaults.timeoutMinutes > 0
                          ? `${runDefaults.timeoutMinutes} minutes`
                          : "the server's time limit"
                      }, as set in Global Settings.`
                    : "This workflow has lower limits of its own; it can't go above the global ones."}{" "}
                  <a
                    href={SETTINGS_URL}
                    target="_blank"
                    rel="noreferrer"
                    className="text-nextflow-green hover:underline"
                  >
                    Change them in Global Settings
                  </a>
                </p>
              </div>
              <input
                id={`${fieldId}-use-default-limits`}
                type="checkbox"
                checked={useDefaultLimits}
                onChange={(e) =>
                  updateSection(
                    "resources",
                    e.target.checked
                      ? { useDefaults: true }
                      : {
                          // Start from the defaults.
                          useDefaults: false,
                          maxCpus: runDefaults.maxCpus,
                          maxMemory: runDefaults.maxMemory,
                          maxTime: minutesToIsoDuration(runDefaults.timeoutMinutes),
                        },
                  )
                }
                className="mt-1 h-4 w-4 accent-nextflow-green"
              />
            </div>
            {!useDefaultLimits && (
              <ResourceLimitsFields
                limits={{
                  maxCpus: settings.resources?.maxCpus ?? 4,
                  maxMemory: settings.resources?.maxMemory ?? "4.GB",
                  timeoutMinutes: isoDurationToMinutes(settings.resources?.maxTime),
                }}
                onChange={({ timeoutMinutes, ...patch }) =>
                  updateSection("resources", {
                    ...patch,
                    ...(timeoutMinutes === undefined
                      ? {}
                      : { maxTime: minutesToIsoDuration(timeoutMinutes) }),
                  })
                }
                serverLimits={serverLimits}
                ceiling={runDefaults}
              />
            )}
          </div>
        );

      case "profiles":
        if (!runProfilesOn) return null;
        return (
          <RunProfilePicker
            settings={settings}
            runDefaults={runDefaults}
            onChange={onSettingsChange}
            onMoveToDefaults={moveProfilesToDefaults}
          />
        );

      case "advanced":
        return (
          <div className="space-y-6">
            <div>
              <label htmlFor={`${fieldId}-nextflow-version`} className={LABEL}>
                Nextflow Version
              </label>
              <select
                id={`${fieldId}-nextflow-version`}
                value={settings.nextflow?.version || "25.04.4"}
                onChange={(e) => updateSection("nextflow", { version: e.target.value })}
                className={INPUT}
              >
                <option value="25.04.4">25.04.4 (Latest Stable)</option>
                <option value="24.04.4">24.04.4 (LTS)</option>
                <option value="23.10.1">23.10.1</option>
                <option value="23.04.4">23.04.4</option>
                <option value="22.10.8">22.10.8</option>
              </select>
              <p className={HINT}>
                The Nextflow runs use. A pipeline that needs a newer one runs with that.
              </p>
            </div>

            <div>
              <label htmlFor={`${fieldId}-error-handling-strategy`} className={LABEL}>
                Error Handling Strategy
              </label>
              <select
                id={`${fieldId}-error-handling-strategy`}
                value={settings.errorHandling?.strategy ?? "terminate"}
                onChange={(e) =>
                  updateSection("errorHandling", {
                    strategy: e.target.value as ExecutionSettings["errorHandling"]["strategy"],
                  })
                }
                className={INPUT}
              >
                {ERROR_STRATEGIES.map((strategy) => (
                  <option key={strategy.value} value={strategy.value}>
                    {strategy.label}
                  </option>
                ))}
              </select>
              <p className={HINT}>
                What Nextflow does when a step fails (its errorStrategy), in runs and in the exported
                project. Other than the default, it also replaces an nf-core pipeline&apos;s own
                retries.
              </p>
            </div>

            <Toggle
              id={`${fieldId}-cleanup-on-failure`}
              label="Cleanup on Failure"
              help="Delete a failed run's work directory to save disk space. Resume can't reuse that run's finished steps then."
              checked={settings.cleanup?.onFailure ?? false}
              onChange={(onFailure) => updateSection("cleanup", { onFailure })}
            />
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
                type="button"
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
