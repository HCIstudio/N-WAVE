import { ExternalLink, Lightbulb } from "lucide-react";
import type React from "react";
import type { FailureExplanation } from "../../../execution/failureExplanations";

interface FailureExplanationCardProps {
  explanation: FailureExplanation;
  /** The canvas step that failed, if known. */
  stepLabel?: string;
  onShowStep?: () => void;
  /** On the light run panel or the dark failure notice. */
  tone?: "light" | "dark";
}

/** Why a run failed, in plain language, and what to do about it. */
const FailureExplanationCard: React.FC<FailureExplanationCardProps> = ({
  explanation,
  stepLabel,
  onShowStep,
  tone = "light",
}) => {
  const dark = tone === "dark";
  return (
    <section
      aria-label="Why the run failed"
      className={`rounded-md border p-3 text-sm ${
        dark ? "border-red-500/50 bg-background text-text" : "border-red-300 bg-red-50 text-gray-900"
      }`}
    >
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
      <div className="mt-2 flex flex-wrap gap-3 text-xs">
        {stepLabel && onShowStep && (
          <button
            type="button"
            onClick={onShowStep}
            className={`font-medium hover:underline ${dark ? "text-nextflow-green" : "text-green-800"}`}
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
          More about this
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </section>
  );
};

export default FailureExplanationCard;
