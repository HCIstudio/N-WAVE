import type React from "react";
import clsx from "clsx";
import { countStages, type RunStage, type StageStatus } from "../../../execution/runStages";

const COLORS: Record<StageStatus, string> = {
  succeeded: "bg-nextflow-green",
  cached: "bg-sky-500",
  running: "bg-yellow-400 animate-pulse motion-reduce:animate-none",
  failed: "bg-red-500",
  waiting: "bg-gray-300",
};

const STATUS_TEXT: Record<StageStatus, string> = {
  succeeded: "done",
  cached: "reused from cache",
  running: "running",
  failed: "failed",
  waiting: "waiting",
};

/** One segment per step, in the order they started; the waiting ones last. */
const StageProgress: React.FC<{ stages: RunStage[]; isRunning: boolean }> = ({ stages, isRunning }) => {
  if (stages.length === 0) return null;
  const counts = countStages(stages);
  const summary = [
    counts.succeeded + counts.cached > 0 && `${counts.succeeded + counts.cached} done`,
    counts.running > 0 && `${counts.running} running`,
    counts.failed > 0 && `${counts.failed} failed`,
    counts.waiting > 0 && `${counts.waiting} ${isRunning ? "waiting" : "not run"}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <section aria-label="Progress by step" className="mt-3">
      <div className="mb-1 flex justify-between text-xs text-gray-800">
        <span>Steps</span>
        <span>{summary}</span>
      </div>
      <ol className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-label={`Steps: ${summary}`}>
        {stages.map((stage) => {
          const status = stage.status === "waiting" && !isRunning ? "not run" : STATUS_TEXT[stage.status];
          const tasks = stage.total > 0 ? `, ${stage.done} of ${stage.total} task${stage.total === 1 ? "" : "s"} finished` : "";
          return (
            <li
              key={stage.id}
              data-status={stage.status}
              title={`${stage.label}: ${status}${tasks}`}
              aria-label={`${stage.label}: ${status}${tasks}`}
              className={clsx("h-full min-w-1 flex-1", COLORS[stage.status])}
            />
          );
        })}
      </ol>
    </section>
  );
};

export default StageProgress;
