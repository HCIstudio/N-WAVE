import type React from "react";
import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import { ClipboardCopy, Download, Lock, ScrollText, Trash2 } from "lucide-react";
import type { ActivityFilter, ActivitySummary } from "../../activity/activityEvents";
import { BUG_REPORT_MINUTES, buildActivityZip, bugReportText } from "../../activity/activityExport";
import {
  flushActivity,
  getCurrentTest,
  getParticipant,
  logActivity,
  PARTICIPANT_PATTERN,
  setParticipant,
  subscribeActivity,
} from "../../activity/activityLog";
import { clearActivity, getActivitySummary, listActivity, saveActivitySettings } from "../../api/activity";
import { downloadBlob } from "../workflow/workflowExport";
import { useFeatures } from "../../settings/useFeatures";
import { getApiErrorMessage } from "../../utils/errors";
import { formatBytes } from "../../utils/fileContent";

const RETENTION_CHOICES: { days: number | null; label: string }[] = [
  { days: null, label: "Keep everything" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 365, label: "1 year" },
];

type Scope = "all" | "range" | "test";

/** "2026-11-01" in local time → the ISO time it starts. */
const startOfDay = (date: string): string => new Date(`${date}T00:00:00`).toISOString();
const startOfNextDay = (date: string): string => {
  const day = new Date(`${date}T00:00:00`);
  day.setDate(day.getDate() + 1);
  return day.toISOString();
};

const formatTime = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const buttonClass =
  "inline-flex items-center gap-1.5 rounded-md border border-panel-border px-3 py-1.5 text-sm text-text hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";

/** Global Settings → Verbose mode: record what happens, mark tests, export and clear the log. */
const VerboseSettings: React.FC = () => {
  const id = useId();
  const { features, locked, save } = useFeatures();
  const recording = features.verbose;
  const isLocked = locked.includes("verbose");
  const participant = useSyncExternalStore(subscribeActivity, getParticipant);
  const [participantDraft, setParticipantDraft] = useState(participant);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [scope, setScope] = useState<Scope>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [testId, setTestId] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => setParticipantDraft(participant), [participant]);

  const load = useCallback(async () => {
    try {
      await flushActivity();
      setSummary(await getActivitySummary());
    } catch (caught: unknown) {
      setMessage({ ok: false, text: getApiErrorMessage(caught, "The activity log could not be read.") });
    }
  }, []);
  // Read again when a test starts or ends (from the marker at the top).
  const currentTest = useSyncExternalStore(subscribeActivity, getCurrentTest);
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentTest is the signal to read again.
  useEffect(() => {
    void load();
  }, [load, currentTest]);

  const fail = (caught: unknown, fallback: string) =>
    setMessage({ ok: false, text: getApiErrorMessage(caught, fallback) });

  const toggle = async (on: boolean) => {
    setMessage(null);
    try {
      const saved = await save({ ...features, verbose: on });
      logActivity("features.changed", { features: saved.features });
      await load();
    } catch (caught: unknown) {
      fail(caught, "Verbose mode could not be switched.");
    }
  };

  const participantValid = PARTICIPANT_PATTERN.test(participantDraft.trim());
  const saveParticipant = () => {
    if (participantDraft.trim() === participant) return;
    if (setParticipant(participantDraft)) {
      setMessage({ ok: true, text: participantDraft.trim() ? "ID saved for this browser." : "ID removed." });
    }
  };

  const changeRetention = async (value: string) => {
    setMessage(null);
    try {
      await saveActivitySettings(value === "" ? null : Number(value));
      await load();
    } catch (caught: unknown) {
      fail(caught, "The retention period could not be saved.");
    }
  };

  const filter = (): ActivityFilter | null => {
    if (scope === "test") return testId ? { test: testId } : null;
    if (scope === "range") {
      if (!from && !to) return null;
      return { ...(from ? { from: startOfDay(from) } : {}), ...(to ? { to: startOfNextDay(to) } : {}) };
    }
    return {};
  };

  const exportZip = async () => {
    const chosen = filter();
    if (!chosen) return;
    setBusy(true);
    setMessage(null);
    try {
      await flushActivity();
      const events = await listActivity(chosen);
      const zip = await buildActivityZip(events);
      const name =
        scope === "test"
          ? `nwave-activity-test-${(summary?.tests.find((test) => test.id === testId)?.label || testId).replace(/[^\w-]+/g, "_")}.zip`
          : "nwave-activity.zip";
      downloadBlob(zip, name);
      setMessage({ ok: true, text: `Exported ${events.length} event${events.length === 1 ? "" : "s"}.` });
    } catch (caught: unknown) {
      fail(caught, "The activity log could not be exported.");
    } finally {
      setBusy(false);
    }
  };

  const copyForBugReport = async () => {
    setMessage(null);
    try {
      await flushActivity();
      const since = new Date(Date.now() - BUG_REPORT_MINUTES * 60_000).toISOString();
      const text = bugReportText(await listActivity({ from: since }));
      await navigator.clipboard.writeText(text);
      setMessage({ ok: true, text: `Copied the last ${BUG_REPORT_MINUTES} minutes. Paste them into the issue.` });
    } catch (caught: unknown) {
      fail(caught, "The events could not be copied.");
    }
  };

  const clear = async () => {
    setConfirming(false);
    setMessage(null);
    try {
      await clearActivity();
      await load();
      setMessage({ ok: true, text: "Cleared." });
    } catch (caught: unknown) {
      fail(caught, "The activity log could not be cleared.");
    }
  };

  const hasEvents = Boolean(summary && summary.events > 0);
  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-lg border border-panel-border p-5">
      <h2 id={`${id}-heading`} className="flex items-center gap-2 text-lg font-semibold text-text">
        <ScrollText className="h-5 w-5" aria-hidden />
        Verbose mode
      </h2>
      <p className="mt-1 text-sm text-text-light">
        Records what happens in N-WAVE, to debug problems and for short usability tests: clicks,
        changes on the canvas, connections, the workflow check, runs and the help opened. File
        contents and parameter values are{" "}
        {summary?.recordsValues ? "recorded too (set by this installation)" : "not recorded"}. A
        marker at the top of every page shows while it records.
      </p>

      <label className="mt-3 flex items-start gap-2 text-sm text-text">
        <input
          type="checkbox"
          checked={recording}
          disabled={isLocked}
          onChange={(event) => void toggle(event.target.checked)}
          className="mt-0.5 h-4 w-4 accent-nextflow-green disabled:cursor-not-allowed"
        />
        <span>
          <span className="font-medium">Record what happens</span>
          {isLocked && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs text-text-light">
              <Lock className="h-3 w-3" aria-hidden />
              Fixed by this installation
            </span>
          )}
          <span className="block text-xs text-text-light">For everyone using this N-WAVE.</span>
        </span>
      </label>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-participant`} className="block text-sm font-medium text-text">
            Participant ID (this browser)
          </label>
          <input
            id={`${id}-participant`}
            value={participantDraft}
            onChange={(event) => setParticipantDraft(event.target.value)}
            onBlur={saveParticipant}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveParticipant();
            }}
            placeholder="e.g. P07"
            maxLength={40}
            aria-invalid={!participantValid}
            aria-describedby={`${id}-participant-help`}
            className="mt-1 w-full rounded-md border border-panel-border bg-background px-2 py-1.5 text-sm text-text"
          />
          <p id={`${id}-participant-help`} className={`mt-1 text-xs ${participantValid ? "text-text-light" : "text-danger"}`}>
            {participantValid
              ? "A code, never a name. Events from this browser carry it."
              : "Only letters, digits, - and _ (no spaces): a code, not a name."}
          </p>
        </div>
        <div>
          <label htmlFor={`${id}-retention`} className="block text-sm font-medium text-text">
            Keep events for
          </label>
          <select
            id={`${id}-retention`}
            value={summary?.activityLog.retentionDays ?? ""}
            onChange={(event) => void changeRetention(event.target.value)}
            disabled={!summary}
            className="mt-1 w-full rounded-md border border-panel-border bg-background px-2 py-1.5 text-sm text-text"
          >
            {RETENTION_CHOICES.map((choice) => (
              <option key={choice.label} value={choice.days ?? ""}>
                {choice.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-4 text-sm text-text" data-testid="activity-summary">
        {summary === null
          ? "Reading…"
          : hasEvents
            ? `${summary.events} event${summary.events === 1 ? "" : "s"} (${formatBytes(summary.bytes)}), from ${formatTime(summary.oldest ?? "")} to ${formatTime(summary.newest ?? "")}.`
            : "Nothing recorded yet."}
      </p>

      <fieldset className="mt-3" disabled={!hasEvents || busy}>
        <legend className="text-sm font-medium text-text">Export as ZIP (JSON Lines, CSV and workflow snapshots)</legend>
        <div className="mt-1.5 space-y-1.5 text-sm text-text">
          <label className="flex items-center gap-2">
            <input type="radio" name={`${id}-scope`} checked={scope === "all"} onChange={() => setScope("all")} />
            Everything
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <input type="radio" name={`${id}-scope`} checked={scope === "range"} onChange={() => setScope("range")} />
              From
            </label>
            <input
              type="date"
              aria-label="Export from"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setScope("range");
              }}
              className="rounded-md border border-panel-border bg-background px-2 py-1 text-sm text-text"
            />
            <span>to</span>
            <input
              type="date"
              aria-label="Export to"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setScope("range");
              }}
              className="rounded-md border border-panel-border bg-background px-2 py-1 text-sm text-text"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${id}-scope`}
                checked={scope === "test"}
                onChange={() => setScope("test")}
                disabled={!summary?.tests.length}
              />
              One test
            </label>
            <select
              aria-label="Test to export"
              value={testId}
              onChange={(event) => {
                setTestId(event.target.value);
                setScope("test");
              }}
              disabled={!summary?.tests.length}
              className="rounded-md border border-panel-border bg-background px-2 py-1 text-sm text-text"
            >
              <option value="">{summary?.tests.length ? "Choose a test…" : "No marked tests"}</option>
              {summary?.tests.map((test) => (
                <option key={test.id} value={test.id}>
                  {test.label || "Unnamed test"} ({formatTime(test.startedAt)}
                  {test.endedAt ? "" : ", not ended"})
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void exportZip()} disabled={filter() === null} className={buttonClass}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            {busy ? "Exporting…" : "Download ZIP"}
          </button>
          <button type="button" onClick={() => void copyForBugReport()} className={buttonClass}>
            <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
            Copy for bug report
          </button>
          {confirming ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="text-text">Delete every recorded event?</span>
              <button
                type="button"
                onClick={() => void clear()}
                className="rounded-md bg-red-600 px-3 py-1.5 text-white hover:bg-red-700"
              >
                Clear log
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={buttonClass}>
                Keep
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={buttonClass}>
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Clear log…
            </button>
          )}
        </div>
      </fieldset>

      {message && (
        <p role={message.ok ? "status" : "alert"} className={`mt-2 text-sm ${message.ok ? "text-text-light" : "text-danger"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
};

export default VerboseSettings;
