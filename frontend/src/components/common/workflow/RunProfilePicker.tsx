import type React from "react";
import { useId, useState } from "react";
import type { RunDefaults } from "../../../api/settings";
import {
  canRunFromNwave,
  EXECUTOR_LABELS,
  findProfileProblems,
} from "../../../execution/runProfiles";
import { availableRunProfiles } from "../../../settings/effectiveSettings";
import type { ExecutionSettings } from "../../../types/execution";
import { getApiErrorMessage } from "../../../utils/errors";

/** The select's value for "the default profile" (runProfile unset). */
const DEFAULT = "@default";

const SETTINGS_URL = `${import.meta.env.BASE_URL}settings`;

interface RunProfilePickerProps {
  settings: ExecutionSettings;
  runDefaults: RunDefaults;
  onChange: (change: Partial<ExecutionSettings>) => void;
  /** Move the profiles the workflow keeps itself to the Settings page. */
  onMoveToDefaults: () => Promise<void>;
}

/**
 * The execution settings' Profiles tab: which run profile this workflow's
 * runs use. The profiles themselves are kept on the Settings page.
 */
const RunProfilePicker: React.FC<RunProfilePickerProps> = ({
  settings,
  runDefaults,
  onChange,
  onMoveToDefaults,
}) => {
  const id = useId();
  const [moveError, setMoveError] = useState<string | null>(null);
  const profiles = availableRunProfiles(settings, runDefaults);
  const runnable = profiles.filter(
    (profile) => canRunFromNwave(profile) && findProfileProblems(profile, profiles).length === 0,
  );
  const own = (settings.runProfiles ?? []).map((profile) => profile.name);
  const value =
    settings.runProfile === undefined
      ? DEFAULT
      : runnable.some((profile) => profile.name === settings.runProfile)
        ? settings.runProfile
        : "";
  const defaultName = runDefaults.runProfile || "this computer";

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor={`${id}-run`} className="mb-1 block text-sm font-medium text-text">
          Runs of this workflow use
        </label>
        <select
          id={`${id}-run`}
          className="w-full rounded-md border border-panel-border bg-background px-2 py-1.5 text-sm text-text"
          value={value}
          onChange={(event) =>
            onChange({
              runProfile: event.target.value === DEFAULT ? undefined : event.target.value,
            })
          }
        >
          <option value={DEFAULT}>The default ({defaultName})</option>
          <option value="">This computer (Execution and Resources settings)</option>
          {runnable.map((profile) => (
            <option key={profile.name} value={profile.name}>
              {profile.name}: {EXECUTOR_LABELS[profile.executor]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-light">
          A run profile says where the steps run: this computer or a SLURM cluster, with which
          containers and default resources. Exported projects get every profile in their{" "}
          <code>nextflow.config</code>.{" "}
          <a
            href={SETTINGS_URL}
            target="_blank"
            rel="noreferrer"
            className="text-nextflow-green hover:underline"
          >
            Add and edit profiles in Settings
          </a>
        </p>
      </div>

      {own.length > 0 && (
        <div role="note" className="rounded-md border border-panel-border p-3 text-sm text-text">
          <p>
            This workflow keeps profiles of its own, from before they moved to Settings:{" "}
            {own.join(", ")}. Moved there, every workflow can use them.
          </p>
          <button
            type="button"
            onClick={() => {
              setMoveError(null);
              onMoveToDefaults().catch((caught: unknown) =>
                setMoveError(getApiErrorMessage(caught, "The profiles could not be moved.")),
              );
            }}
            className="mt-2 rounded-md border border-panel-border px-3 py-1.5 text-sm hover:bg-accent"
          >
            Move to Settings
          </button>
          {moveError && (
            <p role="alert" className="mt-2 text-sm text-red-500">
              {moveError}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default RunProfilePicker;
