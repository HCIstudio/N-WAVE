// A beta feature: it works, but is still being tested on different machines.
// Its badge says so, and links to the form for reporting how it went.

import { FlaskConical } from "lucide-react";
import type React from "react";
import { REPOSITORY_URL } from "../../../docs/links";

/** The GitHub form for a test report on a beta feature, its title filled in. */
export const betaReportUrl = (feature: string): string =>
  `${REPOSITORY_URL}/issues/new?template=beta_feedback.yml&title=${encodeURIComponent(`[Beta] ${feature}`)}`;

/** "Beta" next to a feature's name. */
export const BetaBadge: React.FC<{ className?: string }> = ({ className = "" }) => (
  <span
    className={`inline-flex items-center gap-0.5 rounded-full border border-sky-500/60 bg-sky-100 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-sky-900 ${className}`}
    title="Beta: it works, but is still being tested on different machines"
  >
    <FlaskConical className="h-3 w-3" aria-hidden />
    Beta
  </span>
);

/**
 * What being in beta means for this feature, and where to report how it went.
 * `className` sets its text colour where the panel is light.
 */
export const BetaNote: React.FC<{ feature: string; children?: React.ReactNode; className?: string }> = ({
  feature,
  children,
  className = "text-text-light",
}) => (
  <span role="note" className={`block text-xs ${className}`}>
    <BetaBadge className="mr-1 align-middle" />
    Under test: {children ?? "it works, but is still being checked on different machines."}{" "}
    <a href={betaReportUrl(feature)} target="_blank" rel="noreferrer" className="text-nextflow-green underline">
      Report how it works on yours
    </a>
    .
  </span>
);
