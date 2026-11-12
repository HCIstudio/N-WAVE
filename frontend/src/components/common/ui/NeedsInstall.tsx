// What the browser demo can't do (it has no server): runs and what comes of
// them. The demo shows the same page as an installation, with those parts
// greyed out and why, so both look the same and nothing is a surprise.

import type React from "react";
import { Lock } from "lucide-react";
import { isDemoMode } from "../../../api";
import { wikiUrl } from "../../../docs/links";

/** Why something is greyed out in the demo. */
export const NEEDS_INSTALL =
  "Needs N-WAVE installed with Docker: the browser demo has no server to run workflows on.";

/** `NEEDS_INSTALL` in the demo, null in an installation: for `disabled` and its title. */
export const demoUnavailable: string | null = isDemoMode ? NEEDS_INSTALL : null;

/** The note under a greyed-out part, with the link to the installation. */
export const NeedsInstallNote: React.FC<{ className?: string }> = ({ className = "" }) => (
  <p className={`flex items-center gap-1.5 text-xs text-text-light ${className}`}>
    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
    <span>
      Needs a full install of N-WAVE.{" "}
      <a
        href={wikiUrl({ page: "Installation" })}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-nextflow-green underline"
      >
        Install it with Docker
      </a>
    </span>
  </p>
);

/**
 * In the demo, what it wraps is shown greyed out and can't be used, with the
 * note why. In an installation, just what it wraps.
 */
const NeedsInstall: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className = "",
}) => {
  if (!isDemoMode) return <>{children}</>;
  return (
    <div className={className} data-needs-install>
      <fieldset disabled aria-disabled className="m-0 min-w-0 border-0 p-0" title={NEEDS_INSTALL}>
        <div className="pointer-events-none select-none opacity-50">{children}</div>
      </fieldset>
      <NeedsInstallNote className="mt-2" />
    </div>
  );
};

export default NeedsInstall;
