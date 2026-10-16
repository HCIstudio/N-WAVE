import { Lock } from "lucide-react";
import type React from "react";
import MissingNfCoreBanner from "../../components/canvas/MissingNfCoreBanner";

interface CanvasNoticesProps {
  isRunning: boolean;
  missingNfCoreComponents: string[];
  onNfCoreInstalled: () => void;
  importWarnings: string[];
}

/**
 * Notices at the top of the canvas, clear of the bottom bar and the demo
 * banner. While a run goes the canvas is locked: a frame and a notice say
 * so (the edit guards block the edits).
 */
const CanvasNotices: React.FC<CanvasNoticesProps> = ({
  isRunning,
  missingNfCoreComponents,
  onNfCoreInstalled,
  importWarnings,
}) => (
  <>
    {isRunning && (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 ring-4 ring-inset ring-amber-400/70"
      />
    )}
    {(isRunning ||
      missingNfCoreComponents.length > 0 ||
      importWarnings.length > 0) && (
      <div className="pointer-events-none absolute left-1/2 top-4 z-30 flex w-[min(42rem,calc(100%-9rem))] -translate-x-1/2 flex-col gap-2">
        {isRunning && (
          <output
            aria-label="Workflow locked"
            className="pointer-events-auto flex items-center gap-2 rounded-lg border border-amber-500/60 bg-amber-100 px-4 py-2 text-sm text-amber-900 shadow-lg"
          >
            <Lock className="h-4 w-4 shrink-0" aria-hidden />
            <span>
              Running: the workflow is locked until the run finishes or is
              cancelled.
            </span>
          </output>
        )}
        <MissingNfCoreBanner
          components={missingNfCoreComponents}
          onInstalled={onNfCoreInstalled}
        />
        {importWarnings.length > 0 && (
          <div className="pointer-events-auto rounded-lg border border-yellow-700/40 bg-yellow-100 px-4 py-3 text-sm text-yellow-900 shadow-lg">
            {importWarnings.join(" ")}
          </div>
        )}
      </div>
    )}
  </>
);

export default CanvasNotices;
