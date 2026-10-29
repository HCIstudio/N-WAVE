import type React from "react";
import { useId, useState } from "react";
import { Lock, ToggleRight } from "lucide-react";
import type { FeatureId, Features, WorkflowCheckMode } from "../../api/settings";
import { useFeatures } from "../../settings/useFeatures";
import { getApiErrorMessage } from "../../utils/errors";

/** Each switch: its name and what turning it off changes. */
export const FEATURE_SWITCHES: { id: Exclude<FeatureId, "workflowCheck">; label: string; off: string }[] = [
  {
    id: "connectionHints",
    label: "Connection hints",
    off: "Inputs no longer light up while dragging, and connections that don't fit get no warning.",
  },
  {
    id: "failureExplanations",
    label: "Failure explanations",
    off: "A failed run shows its log, without an explanation in plain language.",
  },
  {
    id: "glossary",
    label: "Glossary and Help",
    off: "No ⓘ term explanations, and no Help button or page.",
  },
  {
    id: "templates",
    label: "Templates and built-in examples",
    off: "New workflows start empty, and the built-in demos are hidden.",
  },
  {
    id: "customCode",
    label: "Custom code",
    off: "No custom process nodes, Code tab or converting nodes to custom ones. Workflows with custom code still run; their code can't be edited.",
  },
  {
    id: "nodePacks",
    label: "Node packs",
    off: "Node packs can't be added, exported or managed. Nodes from installed packs still work.",
  },
  {
    id: "resume",
    label: "Resume",
    off: "Every run starts from scratch; the Resume switch is hidden.",
  },
  {
    id: "runProfiles",
    label: "Run profiles (clusters and the cloud)",
    off: "Runs use this computer; run profiles can't be chosen or edited.",
  },
  {
    id: "notifications",
    label: "Notifications",
    off: "No browser notifications, and their settings are hidden.",
  },
  {
    id: "performance",
    label: "Run performance and reports",
    off: "No Performance tab, execution report or timeline after a run.",
  },
];

export const WORKFLOW_CHECK_MODES: { mode: WorkflowCheckMode; label: string; description: string }[] = [
  { mode: "block", label: "Block the run", description: "Run stays disabled until the problems are fixed." },
  { mode: "warn", label: "Only warn", description: "Problems are shown, but the workflow can still run." },
  { mode: "off", label: "Off", description: "No check; Nextflow reports the problems when the run fails." },
];

const LockedNote: React.FC = () => (
  <span className="ml-2 inline-flex items-center gap-1 text-xs text-text-light">
    <Lock className="h-3 w-3" aria-hidden />
    Fixed by this installation
  </span>
);

/** Global Settings → Features: switch N-WAVE's features on and off. */
const FeatureSettings: React.FC = () => {
  const id = useId();
  const { features, locked, error, save } = useFeatures();
  const [saveError, setSaveError] = useState<string | null>(null);
  const isLocked = (feature: FeatureId) => locked.includes(feature);

  const change = async (patch: Partial<Features>) => {
    setSaveError(null);
    try {
      await save({ ...features, ...patch });
    } catch (caught: unknown) {
      setSaveError(getApiErrorMessage(caught, "The feature switches could not be saved."));
    }
  };

  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-lg border border-panel-border p-5">
      <h2 id={`${id}-heading`} className="flex items-center gap-2 text-lg font-semibold text-text">
        <ToggleRight className="h-5 w-5" aria-hidden />
        Features
      </h2>
      <p className="mt-1 text-sm text-text-light">
        Turn off what this installation's users don't need, or compare how N-WAVE works with and
        without it. Off hides a feature; workflows that use it still open and run. These switches
        apply to everyone using this N-WAVE.
      </p>
      {locked.length > 0 && (
        <p role="note" className="mt-2 text-sm text-text-light">
          Switches marked <Lock className="inline h-3 w-3" aria-label="locked" /> are fixed when
          N-WAVE starts (NWAVE_FEATURES or NWAVE_FEATURES_FILE) and can't be changed here.
        </p>
      )}
      {(error || saveError) && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {saveError ?? error}
        </p>
      )}

      <fieldset className="mt-4" disabled={isLocked("workflowCheck")}>
        <legend className="text-sm font-medium text-text">
          Workflow check before running
          {isLocked("workflowCheck") && <LockedNote />}
        </legend>
        <div className="mt-1.5 space-y-1">
          {WORKFLOW_CHECK_MODES.map(({ mode, label, description }) => (
            <label key={mode} className="flex items-start gap-2 text-sm text-text">
              <input
                type="radio"
                name={`${id}-workflow-check`}
                value={mode}
                checked={features.workflowCheck === mode}
                onChange={() => void change({ workflowCheck: mode })}
                className="mt-0.5 h-4 w-4 accent-nextflow-green"
              />
              <span>
                {label} <span className="text-text-light">— {description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <ul className="mt-4 space-y-3" aria-label="Feature switches">
        {FEATURE_SWITCHES.map((feature) => (
          <li key={feature.id}>
            <label className="flex items-start gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={features[feature.id]}
                disabled={isLocked(feature.id)}
                onChange={(event) => void change({ [feature.id]: event.target.checked })}
                aria-describedby={`${id}-${feature.id}-off`}
                className="mt-0.5 h-4 w-4 accent-nextflow-green disabled:cursor-not-allowed"
              />
              <span>
                <span className="font-medium">{feature.label}</span>
                {isLocked(feature.id) && <LockedNote />}
                <span id={`${id}-${feature.id}-off`} className="block text-xs text-text-light">
                  Off: {feature.off}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
};

export default FeatureSettings;
