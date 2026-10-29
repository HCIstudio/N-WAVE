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

const SETTINGS_URL = `${import.meta.env.BASE_URL}settings`;

interface RunProfilePickerProps {
  settings: ExecutionSettings;
  runDefaults: RunDefaults;
  onChange: (change: Partial<ExecutionSettings>) => void;
  /** Move the profiles the workflow keeps itself to Global Settings. */
  onMoveToDefaults: () => Promise<void>;
}

/**
 * The execution settings' Profiles tab: whether this workflow's runs use the
 * global run profile, or which one. The profiles are kept in Global Settings.
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
  // Unset: whatever Global Settings choose, also when that changes later.
  const usesGlobal = settings.runProfile === undefined;
  const globalChoice = runDefaults.runProfile ?? "";
  const value = usesGlobal ? globalChoice : settings.runProfile;
  const shown = runnable.some((profile) => profile.name === value) ? value : "";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <label htmlFor={`${id}-global`} className="text-sm font-medium text-text">
            Use the global run profile
          </label>
          <p className="mt-1 text-xs text-text-light">
            {usesGlobal
              ? `Runs use ${globalChoice || "this computer"}, as set in Global Settings, and follow it when it changes there.`
              : "This workflow chooses where it runs itself."}{" "}
            <a
              href={SETTINGS_URL}
              target="_blank"
              rel="noreferrer"
              className="text-nextflow-green hover:underline"
            >
              Add and edit profiles in Global Settings
            </a>
          </p>
        </div>
        <input
          id={`${id}-global`}
          type="checkbox"
          checked={usesGlobal}
          // Turned off, it starts from the global choice.
          onChange={(event) =>
            onChange({ runProfile: event.target.checked ? undefined : globalChoice })
          }
          className="mt-1 h-4 w-4 accent-nextflow-green"
        />
      </div>

      <div>
        <label htmlFor={`${id}-run`} className="mb-1 block text-sm font-medium text-text">
          Runs of this workflow use
        </label>
        <select
          id={`${id}-run`}
          disabled={usesGlobal}
          className="w-full rounded-md border border-panel-border bg-background px-2 py-1.5 text-sm text-text disabled:cursor-not-allowed disabled:opacity-50"
          value={shown}
          onChange={(event) => onChange({ runProfile: event.target.value })}
        >
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
          <code>nextflow.config</code>.
        </p>
      </div>

      {own.length > 0 && (
        <div role="note" className="rounded-md border border-panel-border p-3 text-sm text-text">
          <p>
            This workflow keeps profiles of its own, from before they moved to Global Settings:{" "}
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
            Move to Global Settings
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
