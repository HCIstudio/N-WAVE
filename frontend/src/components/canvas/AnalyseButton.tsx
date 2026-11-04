// Analyse in the bottom bar: checks the workflow's code and shows its structure.

import { Loader, ScanSearch } from "lucide-react";
import type React from "react";

interface AnalyseButtonProps {
  running: boolean;
  /** An analysis of the workflow as it is now exists (opening shows it). */
  current: boolean;
  onAnalyse: () => void;
}

const AnalyseButton: React.FC<AnalyseButtonProps> = ({
  running,
  current,
  onAnalyse,
}) => (
  <button
    type="button"
    onClick={onAnalyse}
    aria-label={running ? "Analysing the workflow" : "Analyse the workflow"}
    title="Analyse: check the workflow's code (nextflow lint, BioFlow-Insight) and see its structure"
    className="relative p-1.5 text-text hover:bg-accent rounded-md transition-colors"
  >
    {running ? (
      <Loader className="w-4 h-4 animate-spin" aria-hidden />
    ) : (
      <ScanSearch className="w-4 h-4" aria-hidden />
    )}
    {current && !running && (
      <span
        className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-primary"
        aria-hidden
      />
    )}
  </button>
);

export default AnalyseButton;
