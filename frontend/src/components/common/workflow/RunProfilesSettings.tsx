import type React from "react";
import { useId } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  canRunFromNwave,
  CONTAINER_ENGINE_LABELS,
  type ContainerEngine,
  EXECUTOR_LABELS,
  findProfileProblems,
  RUN_PROFILE_PRESETS,
  type RunExecutor,
  type RunProfile,
} from "../../../execution/runProfiles";

interface RunProfilesSettingsProps {
  profiles: RunProfile[];
  /** The profile runs from N-WAVE use ("" or undefined: this computer). */
  runProfile?: string;
  onChange: (change: { runProfiles?: RunProfile[]; runProfile?: string }) => void;
}

const inputClass =
  "w-full rounded-md border border-panel-border bg-background px-2 py-1.5 text-sm text-text";

/** A name like the preset's that no profile has yet ("slurm", "slurm_2", …). */
const freeName = (base: string, profiles: RunProfile[]): string => {
  let name = base;
  for (let n = 2; profiles.some((profile) => profile.name === name); n++) name = `${base}_${n}`;
  return name;
};

const optionalNumber = (value: string): number | undefined =>
  value.trim() === "" ? undefined : Number(value);

/** One profile's fields. */
const ProfileEditor: React.FC<{
  profile: RunProfile;
  problems: string[];
  onChange: (profile: RunProfile) => void;
  onRemove: () => void;
}> = ({ profile, problems, onChange, onRemove }) => {
  const id = useId();
  const set = (patch: Partial<RunProfile>) => onChange({ ...profile, ...patch });
  const field = (
    key: string,
    label: string,
    input: React.ReactNode,
    hint?: string,
  ) => (
    <div>
      <label htmlFor={`${id}-${key}`} className="mb-1 block text-xs font-medium text-text">
        {label}
      </label>
      {input}
      {hint && <p className="mt-0.5 text-xs text-text-light">{hint}</p>}
    </div>
  );
  const text = (key: keyof RunProfile, placeholder = "") => (
    <input
      id={`${id}-${key}`}
      className={inputClass}
      value={String(profile[key] ?? "")}
      placeholder={placeholder}
      onChange={(event) => set({ [key]: event.target.value || undefined })}
    />
  );
  const number = (key: "cpus" | "queueSize", placeholder: string) => (
    <input
      id={`${id}-${key}`}
      type="number"
      min={1}
      className={inputClass}
      value={profile[key] ?? ""}
      placeholder={placeholder}
      onChange={(event) => set({ [key]: optionalNumber(event.target.value) })}
    />
  );
  return (
    <li
      aria-label={`Profile ${profile.name}`}
      className="rounded-lg border border-panel-border p-4"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-text">-profile {profile.name || "…"}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove profile ${profile.name}`}
          className="rounded p-1 text-text-light hover:bg-accent hover:text-text"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field(
          "name",
          "Name",
          <input
            id={`${id}-name`}
            className={inputClass}
            value={profile.name}
            onChange={(event) => set({ name: event.target.value })}
          />,
        )}
        {field(
          "executor",
          "Runs steps on",
          <select
            id={`${id}-executor`}
            className={inputClass}
            value={profile.executor}
            onChange={(event) => {
              const executor = event.target.value as RunExecutor;
              set({
                executor,
                ...(executor === "awsbatch" ? { containerEngine: "docker" as const } : {}),
              });
            }}
          >
            {(Object.keys(EXECUTOR_LABELS) as RunExecutor[]).map((executor) => (
              <option key={executor} value={executor}>
                {EXECUTOR_LABELS[executor]}
              </option>
            ))}
          </select>,
        )}
        {profile.executor !== "local" &&
          field(
            "queue",
            profile.executor === "slurm" ? "Partition (queue)" : "Job queue",
            text("queue", profile.executor === "slurm" ? "the cluster's default" : "my-job-queue"),
          )}
        {field(
          "containerEngine",
          "Containers",
          <select
            id={`${id}-containerEngine`}
            className={inputClass}
            value={profile.containerEngine}
            disabled={profile.executor === "awsbatch"}
            onChange={(event) => set({ containerEngine: event.target.value as ContainerEngine })}
          >
            {(Object.keys(CONTAINER_ENGINE_LABELS) as ContainerEngine[]).map((engine) => (
              <option key={engine} value={engine}>
                {CONTAINER_ENGINE_LABELS[engine]}
              </option>
            ))}
          </select>,
          profile.executor === "slurm" && profile.containerEngine === "docker"
            ? "Docker must be usable on the compute nodes; clusters usually offer Singularity or Apptainer."
            : undefined,
        )}
        {field("cpus", "CPUs per step", number("cpus", "the step's own"))}
        {field("memory", "Memory per step", text("memory", "e.g. 4 GB"))}
        {field(
          "time",
          "Time per step",
          text("time", "e.g. 2h"),
          profile.executor === "slurm"
            ? "Keep it within the partition's time limit, or jobs wait in the queue for good."
            : undefined,
        )}
        {profile.executor !== "local" &&
          field("queueSize", "Jobs at once", number("queueSize", "Nextflow's default"))}
        {profile.executor === "slurm" &&
          field("clusterOptions", "Extra sbatch options", text("clusterOptions", "e.g. --account=lab"))}
        {profile.executor === "awsbatch" && field("awsRegion", "AWS region", text("awsRegion", "eu-west-1"))}
        {profile.executor === "awsbatch" &&
          field("workDir", "S3 work directory", text("workDir", "s3://my-bucket/work"))}
      </div>
      <p className="mt-2 text-xs text-text-light">
        Steps that set their own CPUs, memory or time keep them; these are the defaults.
      </p>
      {problems.length > 0 && (
        <ul aria-label={`Problems of profile ${profile.name}`} className="mt-2 space-y-0.5 text-sm text-red-500">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
    </li>
  );
};

/** The execution settings' Profiles tab: where steps run, for exports and runs. */
const RunProfilesSettings: React.FC<RunProfilesSettingsProps> = ({
  profiles,
  runProfile = "",
  onChange,
}) => {
  const id = useId();
  const replace = (index: number, profile: RunProfile) => {
    const next = profiles.map((current, i) => (i === index ? profile : current));
    const renamed = profiles[index]?.name === runProfile && profile.name !== runProfile;
    onChange({ runProfiles: next, ...(renamed ? { runProfile: profile.name } : {}) });
  };
  const remove = (index: number) => {
    const removed = profiles[index];
    onChange({
      runProfiles: profiles.filter((_, i) => i !== index),
      ...(removed?.name === runProfile ? { runProfile: "" } : {}),
    });
  };
  const add = (executor: RunExecutor) => {
    const preset = RUN_PROFILE_PRESETS[executor];
    onChange({ runProfiles: [...profiles, { ...preset, name: freeName(preset.name, profiles) }] });
  };
  const runnable = profiles.filter(
    (profile) => canRunFromNwave(profile) && findProfileProblems(profile, profiles).length === 0,
  );
  const selected = profiles.find((profile) => profile.name === runProfile);

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-light">
        A run profile says where the workflow's steps run: this computer, a SLURM cluster or AWS
        Batch, with which containers and default resources. Exported projects get every profile in
        their <code>nextflow.config</code>, to run with <code>-profile &lt;name&gt;</code>.
      </p>

      <div>
        <label htmlFor={`${id}-run`} className="mb-1 block text-sm font-medium text-text">
          Runs from N-WAVE use
        </label>
        <select
          id={`${id}-run`}
          className={inputClass}
          value={selected && runnable.includes(selected) ? runProfile : ""}
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
          A SLURM profile needs the N-WAVE server to run Nextflow where jobs can be submitted, with
          its results folder on storage the compute nodes share. AWS Batch profiles are for
          exported projects only.
        </p>
      </div>

      {profiles.length > 0 && (
        <ul aria-label="Run profiles" className="space-y-3">
          {profiles.map((profile, index) => (
            <ProfileEditor
              // biome-ignore lint/suspicious/noArrayIndexKey: names change while they are typed.
              key={index}
              profile={profile}
              problems={findProfileProblems(profile, profiles)}
              onChange={(next) => replace(index, next)}
              onRemove={() => remove(index)}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {(["slurm", "awsbatch", "local"] as RunExecutor[]).map((executor) => (
          <button
            key={executor}
            type="button"
            onClick={() => add(executor)}
            className="inline-flex items-center gap-1.5 rounded-md border border-panel-border px-3 py-1.5 text-sm text-text hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {executor === "local" ? "Local profile" : `${EXECUTOR_LABELS[executor]} profile`}
          </button>
        ))}
      </div>
    </div>
  );
};

export default RunProfilesSettings;
