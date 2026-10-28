import type React from "react";
import { useEffect, useId, useState } from "react";
import { Cpu, RotateCcw, Server } from "lucide-react";
import type { ResumeMode, RunDefaults } from "../../api/settings";
import ResourceLimitsFields from "../../components/common/workflow/ResourceLimitsFields";
import RunProfilesSettings from "../../components/common/workflow/RunProfilesSettings";
import { findProfileProblems } from "../../execution/runProfiles";
import { useRunDefaults } from "../../settings/useRunDefaults";
import { useServerLimits } from "../../settings/useServerLimits";
import { getApiErrorMessage } from "../../utils/errors";

const RESUME_CHOICES: { value: ResumeMode; label: string }[] = [
  { value: "after-failure", label: "After a failed or stopped run (recommended)" },
  { value: "always", label: "Whenever earlier runs left a cache" },
  { value: "never", label: "Never: every run starts from scratch unless Resume is turned on" },
];

const sectionClass = "rounded-lg border border-panel-border p-5";

/**
 * The Settings page's run defaults: what every workflow's runs use unless
 * the workflow sets its own. Edited here and saved together.
 */
const RunDefaultsSettings: React.FC = () => {
  const id = useId();
  const { defaults, loaded, error: loadError, save } = useRunDefaults();
  const serverLimits = useServerLimits();
  const [draft, setDraft] = useState<RunDefaults>(defaults);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const changed = JSON.stringify(draft) !== JSON.stringify(defaults);

  // Take what N-WAVE has once it's read, unless edits were made meanwhile.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the saved defaults change.
  useEffect(() => {
    if (!changed) setDraft(defaults);
  }, [defaults]);

  const set = (patch: Partial<RunDefaults>) => {
    setStatus(null);
    setDraft((current) => ({ ...current, ...patch }));
  };
  const problems = draft.runProfiles.flatMap((profile) =>
    findProfileProblems(profile, draft.runProfiles),
  );

  const onSave = async () => {
    setSaving(true);
    setStatus(null);
    try {
      setDraft(await save(draft));
      setStatus({ ok: true, text: "Saved. Workflows without their own settings use these from now on." });
    } catch (caught: unknown) {
      setStatus({ ok: false, text: getApiErrorMessage(caught, "The run defaults could not be saved.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {loadError && !loaded && (
        <p role="alert" className="rounded-md border border-red-500/40 p-3 text-sm text-red-500">
          {loadError} The built-in defaults are shown.
        </p>
      )}
      <section aria-labelledby={`${id}-limits`} className={sectionClass}>
        <h2 id={`${id}-limits`} className="flex items-center gap-2 text-lg font-semibold text-text">
          <Cpu className="h-5 w-5" aria-hidden />
          Run limits
        </h2>
        <p className="mb-4 mt-1 text-sm text-text-light">
          The most a run may use, for every workflow that doesn't set its own limits (Execution
          Settings → Resources on the canvas).
        </p>
        <ResourceLimitsFields
          limits={draft}
          onChange={(patch) => set(patch)}
          serverLimits={serverLimits}
        />
      </section>

      <section aria-labelledby={`${id}-resume`} className={sectionClass}>
        <h2 id={`${id}-resume`} className="flex items-center gap-2 text-lg font-semibold text-text">
          <RotateCcw className="h-5 w-5" aria-hidden />
          Resume
        </h2>
        <label htmlFor={`${id}-resume-mode`} className="mb-1 mt-3 block text-sm font-medium text-text">
          Resume is on by Run
        </label>
        <select
          id={`${id}-resume-mode`}
          value={draft.resume}
          onChange={(event) => set({ resume: event.target.value as ResumeMode })}
          className="w-full rounded-md border border-panel-border bg-background px-2 py-1.5 text-sm text-text"
        >
          {RESUME_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-text-light">
          Resume reuses the steps an earlier run finished whose code and inputs haven't changed.
          It can always be turned on or off next to Run.
        </p>
      </section>

      <section aria-labelledby={`${id}-profiles`} className={sectionClass}>
        <h2 id={`${id}-profiles`} className="mb-3 flex items-center gap-2 text-lg font-semibold text-text">
          <Server className="h-5 w-5" aria-hidden />
          Run profiles
        </h2>
        <RunProfilesSettings
          profiles={draft.runProfiles}
          runProfile={draft.runProfile}
          runLabel="Runs use by default"
          onChange={(change) =>
            set({
              ...(change.runProfiles ? { runProfiles: change.runProfiles } : {}),
              ...(change.runProfile === undefined ? {} : { runProfile: change.runProfile || undefined }),
            })
          }
        />
        <p className="mt-3 text-xs text-text-light">
          A workflow can choose another profile, or this computer, in Execution Settings →
          Profiles. Workflows from before this page keep running on this computer.
        </p>
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-panel-border bg-background py-3">
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={!changed || saving || problems.length > 0}
          title={problems.length > 0 ? "Fix the problems of the run profiles first" : undefined}
          className="rounded-md bg-nextflow-green px-4 py-2 text-sm font-medium text-white hover:bg-nextflow-green/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save run defaults"}
        </button>
        <button
          type="button"
          onClick={() => {
            setDraft(defaults);
            setStatus(null);
          }}
          disabled={!changed || saving}
          className="rounded-md border border-panel-border px-4 py-2 text-sm text-text hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          Discard changes
        </button>
        {status && (
          <p role={status.ok ? "status" : "alert"} className={`text-sm ${status.ok ? "text-text-light" : "text-red-500"}`}>
            {status.text}
          </p>
        )}
      </div>
    </>
  );
};

export default RunDefaultsSettings;
