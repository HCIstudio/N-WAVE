import { ExternalLink, Lightbulb } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { logActivity } from "../../../activity/activityLog";
import type { FailureExplanation } from "../../../execution/failureExplanations";
import { useFeature } from "../../../settings/useFeatures";
import { howExplainedUrl } from "../../../docs/links";

interface FailureExplanationCardProps {
  explanation: FailureExplanation;
  /** The canvas step that failed, if known. */
  stepLabel?: string;
  onShowStep?: () => void;
  /** Show a line of the run's log (counted from 0), e.g. by opening the Log tab. */
  onShowEvidence?: (line: number) => void;
  /** On the light run panel or the dark failure notice. */
  tone?: "light" | "dark";
}

/** Shown in the run panel and the failure notice at once: recorded once. */
const RECORDED_AGAIN_AFTER_MS = 10_000;
let lastRecorded = { key: "", at: 0 };

/** Verbose mode: an explanation shown (once, though it shows in two places). */
const recordShown = (explanation: FailureExplanation) => {
  const key = `${explanation.kind}\n${explanation.explanation}`;
  const now = Date.now();
  if (key === lastRecorded.key && now - lastRecorded.at < RECORDED_AGAIN_AFTER_MS) return;
  lastRecorded = { key, at: now };
  logActivity("failure.explained", {
    kind: explanation.kind,
    title: explanation.title,
    certainty: explanation.certainty,
    ...(explanation.process ? { process: explanation.process } : {}),
  });
};

/** Why a run failed, in plain language, and what to do about it. */
const FailureExplanationCard: React.FC<FailureExplanationCardProps> = ({
  explanation,
  stepLabel,
  onShowStep,
  onShowEvidence,
  tone = "light",
}) => {
  const dark = tone === "dark";
  const link = `font-medium hover:underline ${dark ? "text-nextflow-green" : "text-green-800"}`;
  const muted = dark ? "text-text-light" : "text-gray-700";
  // Verbose mode: asks whether it helped, and records the answer.
  const recording = useFeature("verbose");
  const [answered, setAnswered] = useState<{ kind: string; helpful: boolean } | null>(null);
  const answer = (helpful: boolean) => {
    logActivity("failure.feedback", {
      kind: explanation.kind,
      certainty: explanation.certainty,
      helpful,
    });
    setAnswered({ kind: explanation.kind, helpful });
  };
  const likely = explanation.certainty === "likely";
  // Global Settings → Features can switch explanations off everywhere.
  const explanationsOn = useFeature("failureExplanations");
  // biome-ignore lint/correctness/useExhaustiveDependencies: recorded when what it says changes.
  useEffect(() => {
    if (explanationsOn) recordShown(explanation);
  }, [explanationsOn, explanation.kind, explanation.explanation]);
  if (!explanationsOn) return null;
  return (
    <section
      aria-label="Why the run failed"
      className={`rounded-md border p-3 text-sm ${
        dark ? "border-red-500/50 bg-background text-text" : "border-red-300 bg-red-50 text-gray-900"
      }`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-wide ${
          likely ? (dark ? "text-amber-300" : "text-amber-800") : dark ? "text-red-300" : "text-red-800"
        }`}
        title={
          likely
            ? "The log matches this cause, but other problems can print the same."
            : "The log shows this cause unambiguously."
        }
      >
        {likely ? "Likely cause" : "Cause"}
      </p>
      <h4 className="font-semibold">{explanation.title}</h4>
      <p className="mt-1">
        {stepLabel && (
          <>
            In “{stepLabel}”:{" "}
          </>
        )}
        {explanation.explanation}
      </p>
      <p className="mt-2 flex items-start gap-1.5">
        <Lightbulb
          className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? "text-nextflow-green" : "text-green-700"}`}
          aria-hidden
        />
        <span>{explanation.fix}</span>
      </p>
      {explanation.evidence.length > 0 && (
        <div className="mt-2 text-xs">
          <p className={`font-medium ${muted}`}>Based on these lines of the log:</p>
          <ul aria-label="Evidence from the log" className="mt-1 space-y-1">
            {explanation.evidence.map((evidence) => (
              <li key={`${evidence.line}:${evidence.text}`} className="flex items-start gap-2">
                <code
                  className={`min-w-0 flex-1 break-words rounded px-1.5 py-0.5 font-mono ${
                    dark ? "bg-black/30" : "bg-white/70"
                  }`}
                >
                  {evidence.text}
                </code>
                {onShowEvidence && evidence.line >= 0 && (
                  <button
                    type="button"
                    onClick={() => onShowEvidence(evidence.line)}
                    className={`shrink-0 ${link}`}
                    aria-label={`Show line ${evidence.line + 1} in the log`}
                  >
                    Show in log
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {explanation.alternatives.length > 0 && (
        <div className="mt-2 text-xs">
          <p className={`font-medium ${muted}`}>It could also be:</p>
          <ul aria-label="Other possible causes" className="ml-4 mt-1 list-disc space-y-0.5">
            {explanation.alternatives.map((alternative) => (
              <li key={alternative}>{alternative}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {stepLabel && onShowStep && (
          <button
            type="button"
            onClick={onShowStep}
            className={link}
          >
            Show “{stepLabel}”
          </button>
        )}
        <a
          href={explanation.docs}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-1 font-medium hover:underline ${
            dark ? "text-nextflow-green" : "text-green-800"
          }`}
        >
          What to do
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
        <a
          href={howExplainedUrl(explanation.kind)}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-1 ${link}`}
        >
          How N-WAVE knows
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
      {recording && (
        <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${muted}`}>
          {answered?.kind === explanation.kind ? (
            <span role="status">Thanks, your answer was recorded.</span>
          ) : (
            <>
              <span>Did this help?</span>
              {[true, false].map((helpful) => (
                <button
                  key={String(helpful)}
                  type="button"
                  onClick={() => answer(helpful)}
                  className={`rounded border px-2 py-0.5 font-medium ${
                    dark ? "border-panel-border hover:bg-accent" : "border-gray-300 bg-white hover:bg-gray-100"
                  }`}
                >
                  {helpful ? "Yes" : "No"}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default FailureExplanationCard;
