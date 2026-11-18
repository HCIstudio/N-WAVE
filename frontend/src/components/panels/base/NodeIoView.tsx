import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { getRunAccesses, type LinkedTask, type RunAccesses, type TaskFile } from "../../../api/runs";
import {
  accessPattern,
  describePattern,
  describeStepFolders,
  fileName,
  followFile,
  stepWorkFolders,
} from "../../../execution/ioViews";
import { BetaNote } from "../../common/ui/BetaBadge";
import { IO_MONITOR_SWITCH } from "../../../settings/ioMonitorSwitch";
import { useFeature } from "../../../settings/useFeatures";
import { formatBytes } from "../../../utils/fileContent";
import { wikiUrl } from "../../../docs/links";

export const IO_MONITOR_PAPER = "https://arxiv.org/abs/2408.00411";

/** Colours for reads and writes (validated against the panel for colour-blind separation and contrast). */
const READ = "#3987e5";
const WRITE = "#d95926";

const Credit: React.FC = () => (
  <p className="text-xs text-text-light">
    Recorded with the I/O monitor of Witzke et al., "Low-level I/O Monitoring for Scientific Workflows" (
    <a href={IO_MONITOR_PAPER} target="_blank" rel="noreferrer" className="text-sky-300 underline">
      arXiv:2408.00411
    </a>
    ), linked to steps with their method.
  </p>
);

/** When a file was accessed, as a bar over the task's time. */
const WhenBar: React.FC<{ file: TaskFile; duration: number }> = ({ file, duration }) => {
  const left = duration > 0 ? (file.firstAccess / duration) * 100 : 0;
  const width = duration > 0 ? Math.max(((file.lastAccess - file.firstAccess) / duration) * 100, 1.5) : 100;
  return (
    <div className="relative h-2 w-24 rounded bg-accent" aria-hidden>
      <div className="absolute h-2 rounded bg-sky-400" style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }} />
    </div>
  );
};

/** A file's reads and writes over time, by every task that touched it (their Fig. 5). */
export const OffsetsChart: React.FC<{ accesses: Extract<RunAccesses, { status: "recorded" }>; path: string }> = ({
  accesses,
  path,
}) => {
  const points = useMemo(() => followFile(accesses, path), [accesses, path]);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length === 0) return <p className="text-xs text-text-light">No reads or writes of this file were recorded.</p>;
  const t0 = Math.min(...points.map((p) => p.time));
  const t1 = Math.max(...points.map((p) => p.time), t0 + 0.001);
  const top = Math.max(...points.map((p) => p.offset + p.bytes), 1);
  const W = 560;
  const H = 180;
  const pad = { l: 52, r: 8, t: 8, b: 26 };
  const x = (t: number) => pad.l + ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (offset: number) => H - pad.b - (offset / top) * (H - pad.t - pad.b);
  const tasks = [...new Set(points.map((p) => p.task))];
  const shown = hover === null ? null : points[hover];
  return (
    <figure className="space-y-1" aria-label={`Reads and writes of ${fileName(path)} over time`}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Offsets of ${fileName(path)} read and written over time`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const tx = ((event.clientX - box.left) / box.width) * W;
          let best = 0;
          points.forEach((p, i) => {
            if (Math.abs(x(p.time) - tx) < Math.abs(x((points[best] as typeof p).time) - tx)) best = i;
          });
          setHover(best);
        }}
      >
        <line x1={pad.l} y1={H - pad.b} x2={W - pad.r} y2={H - pad.b} stroke="#5a5a5a" />
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={H - pad.b} stroke="#5a5a5a" />
        <text x={pad.l - 4} y={pad.t + 8} textAnchor="end" fontSize="10" fill="#A0A0A0">
          {formatBytes(top)}
        </text>
        <text x={pad.l - 4} y={H - pad.b} textAnchor="end" fontSize="10" fill="#A0A0A0">
          0
        </text>
        <text x={pad.l} y={H - 8} fontSize="10" fill="#A0A0A0">
          0 s
        </text>
        <text x={W - pad.r} y={H - 8} textAnchor="end" fontSize="10" fill="#A0A0A0">
          {`${(t1 - t0).toFixed(1)} s`}
        </text>
        {points.map((p, i) => (
          <line
            // biome-ignore lint/suspicious/noArrayIndexKey: samples have no id; their order is fixed.
            key={i}
            x1={x(p.time)}
            x2={x(p.time)}
            y1={y(p.offset)}
            y2={Math.min(y(p.offset + p.bytes), y(p.offset) - 2)}
            stroke={p.type === "R" ? READ : WRITE}
            strokeWidth={hover === i ? 4 : 2}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-3 text-xs text-text-light">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded" style={{ background: READ }} /> read
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded" style={{ background: WRITE }} /> written
        </span>
        <span>
          by {tasks.join(", ")}; the offset in the file over the run's time.
        </span>
      </figcaption>
      <p className="min-h-4 text-xs text-text" aria-live="polite" data-testid="offsets-hover">
        {shown
          ? `${shown.task} ${shown.type === "R" ? "read" : "wrote"} ${formatBytes(shown.bytes)} at ${formatBytes(shown.offset)}, ${(shown.time - t0).toFixed(2)} s`
          : ""}
      </p>
    </figure>
  );
};

/** One task's files: sizes, when, and whether it streamed or read them at once. */
const TaskFiles: React.FC<{ task: LinkedTask; onFollow: (path: string) => void; following: string | null }> = ({
  task,
  onFollow,
  following,
}) => {
  const duration = task.end - task.start;
  const files = task.files.filter((file) => file.bytesRead > 0 || file.bytesWritten > 0);
  if (files.length === 0) return <p className="text-xs text-text-light">No file reads or writes of this task were recorded.</p>;
  return (
    <table aria-label={`Files of ${task.name}`} className="w-full text-left text-xs">
      <thead className="text-text-light">
        <tr>
          <th className="py-1 pr-2 font-medium">File</th>
          <th className="py-1 pr-2 font-medium">Read</th>
          <th className="py-1 pr-2 font-medium">Written</th>
          <th className="py-1 pr-2 font-medium">When</th>
          <th className="py-1 pr-2 font-medium">How</th>
          <th className="py-1 font-medium" />
        </tr>
      </thead>
      <tbody>
        {files.map((file) => (
          <tr key={`${file.inode}:${file.path}`} className="border-t border-panel-border align-top">
            <td className="max-w-48 truncate py-1 pr-2 font-mono" title={file.path}>
              {fileName(file.path)}
            </td>
            <td className="py-1 pr-2">{file.bytesRead ? formatBytes(file.bytesRead) : "–"}</td>
            <td className="py-1 pr-2">{file.bytesWritten ? formatBytes(file.bytesWritten) : "–"}</td>
            <td className="py-1 pr-2">
              <WhenBar file={file} duration={duration} />
            </td>
            <td className="py-1 pr-2">
              {[
                file.bytesRead ? `read ${describePattern(accessPattern(file, "R", duration))}` : null,
                file.bytesWritten ? `written ${describePattern(accessPattern(file, "W", duration))}` : null,
              ]
                .filter(Boolean)
                .join("; ")}
            </td>
            <td className="py-1">
              <button
                type="button"
                onClick={() => onFollow(file.path)}
                aria-pressed={following === file.path}
                className="rounded px-1.5 text-text-light hover:bg-accent hover:text-text"
              >
                Follow
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/** How a step read and wrote its files, from the I/O monitor (if it was on for the run). */
const NodeIoView: React.FC<{ runId: string; hashes: string[] }> = ({ runId, hashes }) => {
  const performanceOn = useFeature("performance");
  const [accesses, setAccesses] = useState<RunAccesses | null>(null);
  const [taskHash, setTaskHash] = useState<string | null>(null);
  const [following, setFollowing] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getRunAccesses(runId).then(
      (next) => !cancelled && setAccesses(next),
      () => !cancelled && setAccesses({ status: "failed" }),
    );
    return () => {
      cancelled = true;
    };
  }, [runId]);
  const own = useMemo(
    () => (accesses?.status === "recorded" ? accesses.tasks.filter((task) => hashes.includes(task.hash)) : []),
    [accesses, hashes],
  );
  if (!performanceOn || !accesses) return null;
  if (accesses.status !== "recorded") {
    return (
      <section aria-label="File accesses of this step" className="space-y-1 rounded-md border border-panel-border p-3">
        <h3 className="text-sm font-semibold text-text">Files read and written</h3>
        <p className="text-xs text-text-light" data-testid="io-view-off">
          {accesses.status === "running"
            ? "The I/O monitor records this run; its files show here when the run has ended."
            : accesses.status === "unavailable"
              ? `The I/O monitor couldn't record this run: ${accesses.reason ?? ""}`
              : "The I/O monitor was off for this run. With it on (Global Settings → I/O monitor, on Linux and Docker Desktop), each step shows here which files it read and wrote, when, and whether it read them as it went or all at once."}{" "}
          <a href={wikiUrl({ page: "IO-Monitor" })} target="_blank" rel="noreferrer" className="text-sky-300 underline">
            I/O monitor
          </a>
        </p>
      </section>
    );
  }
  const task = own.find((candidate) => candidate.hash === taskHash) ?? own[0];
  const folders = stepWorkFolders(accesses.workFolders, hashes);
  return (
    <section aria-label="File accesses of this step" className="space-y-2 rounded-md border border-panel-border p-3">
      <h3 className="text-sm font-semibold text-text">Files read and written</h3>
      <BetaNote feature={IO_MONITOR_SWITCH.label}>{IO_MONITOR_SWITCH.beta}</BetaNote>
      {folders && (
        <p
          data-testid="io-view-work-folders"
          className={`text-xs ${folders.missed > 0 ? "rounded-md border border-yellow-500/40 bg-yellow-900/20 p-2 text-yellow-100" : "text-text-light"}`}
        >
          {describeStepFolders(folders)}
        </p>
      )}
      {own.length === 0 ? (
        <p className="text-xs text-text-light">The monitor's records have no accesses of this step's tasks.</p>
      ) : (
        <>
          {own.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-text">
              Task
              <select
                value={task?.hash}
                onChange={(event) => setTaskHash(event.target.value)}
                className="rounded border border-panel-border bg-accent px-1 py-0.5"
              >
                {own.map((candidate) => (
                  <option key={candidate.hash} value={candidate.hash}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {task && <TaskFiles task={task} onFollow={setFollowing} following={following} />}
          {following && <OffsetsChart accesses={accesses} path={following} />}
        </>
      )}
      <Credit />
    </section>
  );
};

export default NodeIoView;
