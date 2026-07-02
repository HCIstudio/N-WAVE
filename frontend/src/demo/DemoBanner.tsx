import { useState } from "react";

/**
 * Small, dismissible badge shown only in the backend-less demo build. It tells
 * visitors their projects are ephemeral (stored in this browser) and that
 * execution requires the downloadable Docker version.
 */
const DemoBanner = () => {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="fixed bottom-3 left-3 z-50 max-w-xs rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-md">
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5">
          🧪
        </span>
        <div>
          <strong>Demo mode.</strong> Projects are saved only in this browser and
          workflows can't be executed here. Build, edit and export freely — then{" "}
          <a
            href="https://github.com/HCIstudio/N-WAVE#readme"
            target="_blank"
            rel="noreferrer"
            className="font-medium underline"
          >
            run it with Docker
          </a>{" "}
          for real.
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-1 text-amber-700 hover:text-amber-900"
          aria-label="Dismiss demo notice"
        >
          ✕
        </button>
      </div>
    </div>
  );
};

export default DemoBanner;
