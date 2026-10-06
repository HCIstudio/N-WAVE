import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { FlaskConical, X } from "lucide-react";

/** Gap in px between the banner and the footer (or the viewport bottom). */
const GAP = 12;

/**
 * Small, dismissible badge shown only in the backend-less demo build. It tells
 * visitors their projects are ephemeral (stored in this browser) and that
 * execution requires the downloadable Docker version.
 */
const DemoBanner = () => {
  const [dismissed, setDismissed] = useState(false);
  // Distance from the viewport bottom. Sits above the page footer when one is
  // present so it never overlays the footer or its logos; otherwise rests near
  // the bottom edge.
  const [bottomOffset, setBottomOffset] = useState(GAP);
  const location = useLocation();

  // Re-measure after navigation: each route has a different footer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname is the re-measure trigger.
  useEffect(() => {
    const measure = () => {
      const footer = document.querySelector("footer");
      if (!footer) {
        // No footer on this route — sit near the viewport bottom.
        setBottomOffset(GAP);
        return;
      }
      // Distance from the viewport bottom up to the footer's top edge, so the
      // banner rests GAP px above the footer wherever it actually sits (the
      // footer isn't always flush with the viewport bottom). Falls back to GAP
      // when the footer is scrolled out of view below the fold.
      const distanceToFooterTop =
        window.innerHeight - footer.getBoundingClientRect().top;
      setBottomOffset(Math.max(GAP, distanceToFooterTop + GAP));
    };

    measure();

    // The footer's top settles asynchronously after mount — it renders after
    // the data load, then shifts as workflow cards, the tutorial callout, logo
    // images and fonts lay in. Re-measure across the first second to catch it.
    const timers = [50, 150, 350, 700, 1200].map((ms) =>
      window.setTimeout(measure, ms),
    );

    // Ongoing: content above the footer changing height (which moves its top)
    // shows up as a body size change; plus viewport resize and scroll.
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(document.body);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      timers.forEach(window.clearTimeout);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
    // Re-measure on navigation, since the footer differs between routes.
  }, [location.pathname]);

  if (dismissed) return null;

  return (
    <div
      className="fixed left-3 z-50 max-w-xs rounded-lg border border-panel-border border-l-4 border-l-warning bg-panel-background px-3 py-2 text-xs text-text shadow-lg"
      style={{ bottom: bottomOffset }}
    >
      <div className="flex items-start gap-2">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="text-text-light">
          <strong className="text-text">Demo mode.</strong> Projects are saved
          only in this browser and workflows can't be executed here. Build, edit
          and export freely — then{" "}
          <a
            href="https://github.com/HCIstudio/N-WAVE#readme"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-nextflow-green underline"
          >
            run it with Docker
          </a>{" "}
          for real.
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="ml-1 text-text-light hover:text-text"
          aria-label="Dismiss demo notice"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default DemoBanner;
