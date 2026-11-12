// While the workflow is analysed: its stages, the one it is at, and how long
// it has taken. Shown in the analysis panel and in the graph views.

import clsx from "clsx";
import { Check, Loader } from "lucide-react";
import type React from "react";
import type { AnalysisProgress as Progress, AnalysisStage } from "../../analysis/useAnalysisProgress";

const STAGES: Array<{ id: AnalysisStage; label: string }> = [
  { id: "code", label: "Writing the workflow's code" },
  { id: "download", label: "Downloading the analysis tools (first time only)" },
  { id: "reading", label: "nextflow lint and BioFlow-Insight read the code" },
];

const elapsed = (seconds: number) =>
  seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;

const AnalysisProgress: React.FC<{ progress: Progress; tone?: "panel" | "blueprint" }> = ({
  progress,
  tone = "panel",
}) => {
  // The download stage only when there is something to download.
  const stages = STAGES.filter((stage) => stage.id !== "download" || progress.downloading);
  const current = stages.findIndex((stage) => stage.id === progress.stage);
  const muted = tone === "blueprint" ? "text-sky-100/75" : "text-text-light";
  return (
    <div role="status" aria-label="Analysing the workflow" className="space-y-2 text-sm">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stages.length}
        aria-valuenow={current}
        aria-valuetext={stages[current]?.label}
        className={clsx("flex h-1.5 gap-1 overflow-hidden", tone === "blueprint" ? "opacity-90" : "")}
      >
        {stages.map((stage, index) => (
          <span
            key={stage.id}
            className={clsx(
              "flex-1 rounded-full",
              index < current && "bg-nextflow-green",
              index === current && "analysis-progress-current bg-nextflow-green/40",
              index > current && (tone === "blueprint" ? "bg-white/15" : "bg-accent"),
            )}
          />
        ))}
      </div>
      <ol className="space-y-1">
        {stages.map((stage, index) => (
          <li key={stage.id} className={clsx("flex items-center gap-2", index > current && muted)}>
            {index < current ? (
              <Check className="h-4 w-4 shrink-0 text-nextflow-green" aria-label="Done" />
            ) : index === current ? (
              <Loader className="h-4 w-4 shrink-0 animate-spin" aria-label="Now" />
            ) : (
              <span className="h-4 w-4 shrink-0" aria-hidden />
            )}
            {stage.label}
            {stage.id === "download" && index === current && progress.missing.length > 0 && (
              <span className={clsx("text-xs", muted)}>({progress.missing.length} left)</span>
            )}
          </li>
        ))}
      </ol>
      <p className={clsx("text-xs", muted)}>
        {elapsed(progress.seconds)} so far.{" "}
        {progress.downloading
          ? "The first analysis downloads the tools (a few hundred MB); later ones take seconds."
          : "Usually a few seconds; a large workflow, or nf-core modules to fetch, take longer."}
      </p>
    </div>
  );
};

export default AnalysisProgress;
