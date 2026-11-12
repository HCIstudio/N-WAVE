import type React from "react";
import { useEffect, useState } from "react";

type AnchorPlacement = "above" | "below" | "left" | "left-start" | "right" | "center";

interface TutorialCalloutProps {
  text: React.ReactNode;
  targetSelector?: string;
  placement?: AnchorPlacement;
  canGoBack?: boolean;
  canGoForward?: boolean;
  skipLabel?: string;
  /** The main button's text: Next, or what the step does. */
  forwardLabel?: string;
  /** Where the user is, e.g. "3 of 8". */
  progress?: string;
  onBack?: () => void;
  onForward?: () => void;
  onSkip?: () => void;
}

const CALLOUT_WIDTH = 320;

/** Look shared by every tutorial box (here and on the home page). */
export const TUTORIAL_BOX_CLASS =
  "rounded-md border border-l-4 border-panel-border border-l-sky-400 bg-panel-background text-text shadow-lg";

/**
 * A box that floats over the page: a deep shadow and a sky ring set it apart
 * from whatever is behind it.
 */
const FLOATING_CLASS = "ring-1 ring-sky-400/60 shadow-[0_12px_40px_rgba(0,0,0,0.6)]";

/** Marks what a step points at (index.css): outlined while the step shows. */
const TARGET_CLASS = "tutorial-target";

/** Small label at the top of a tutorial box: the course it is part of. */
export const TutorialBadge: React.FC = () => (
  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-sky-300">
    Course · N-WAVE basics
  </p>
);

const TutorialCallout: React.FC<TutorialCalloutProps> = ({
  text,
  targetSelector,
  placement = "above",
  canGoBack = true,
  canGoForward = true,
  skipLabel = "Skip tutorial",
  forwardLabel = "Next",
  progress,
  onBack,
  onForward,
  onSkip,
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // What the step points at is outlined, so it stands out from the page.
  useEffect(() => {
    if (!targetSelector) return;
    const target = document.querySelector(targetSelector);
    target?.classList.add(TARGET_CLASS);
    return () => target?.classList.remove(TARGET_CLASS);
  }, [targetSelector]);

  useEffect(() => {
    const updatePosition = () => {
      if (placement === "center" || !targetSelector) {
        setPosition({
          top: window.innerHeight / 2,
          left: window.innerWidth / 2,
        });
        return;
      }

      const target = document.querySelector(targetSelector);
      if (!target) {
        setPosition({
          top: window.innerHeight / 2,
          left: window.innerWidth / 2,
        });
        return;
      }

      // Out of view (further down the home page): scrolled to first.
      const before = target.getBoundingClientRect();
      if (before.bottom < 0 || before.top > window.innerHeight) target.scrollIntoView({ block: "center" });
      const rect = target.getBoundingClientRect();
      const viewportPadding = 16;
      const left =
        placement === "right"
          ? rect.right + 12
          : placement === "left" || placement === "left-start"
            ? rect.left - CALLOUT_WIDTH - 12
            : rect.left + rect.width / 2 - CALLOUT_WIDTH / 2;
      const top =
        placement === "below"
          ? rect.bottom + 12
          : placement === "left-start"
          ? rect.top
          : placement === "right" || placement === "left"
          ? rect.top + rect.height / 2
          : rect.top - 16;

      setPosition({
        top: Math.max(viewportPadding, top),
        left: Math.min(
          Math.max(viewportPadding, left),
          window.innerWidth - CALLOUT_WIDTH - viewportPadding
        ),
      });
    };

    updatePosition();
    const timeoutId = window.setTimeout(updatePosition, 150);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [placement, targetSelector]);

  const transform =
    placement === "center"
      ? "translate(-50%, -50%)"
      : placement === "above"
        ? "translateY(-100%)"
        : placement === "left-start" || placement === "below"
          ? "none"
        : "translateY(-50%)";

  return (
    <section
      aria-label="Tutorial"
      aria-live="polite"
      className={`fixed z-50 w-[320px] p-4 ${TUTORIAL_BOX_CLASS} ${FLOATING_CLASS}`}
      style={{ top: position.top, left: position.left, transform }}
    >
      <div className="flex items-baseline justify-between">
        <TutorialBadge />
        {progress && <span className="text-xs text-text-light">{progress}</span>}
      </div>
      <p className="text-sm leading-5">{text}</p>
      <div className="mt-3 flex items-center gap-2">
        {canGoBack && (
          <button type="button" onClick={onBack} className="rounded-md px-2 py-1.5 text-sm text-text hover:bg-accent">
            Back
          </button>
        )}
        <button type="button" onClick={onSkip} className="rounded-md px-2 py-1.5 text-xs text-sky-300 hover:bg-accent">
          {skipLabel}
        </button>
        {canGoForward && (
          <button
            type="button"
            onClick={onForward}
            className="ml-auto rounded-md bg-nextflow-green px-3 py-1.5 text-sm font-medium text-white hover:bg-nextflow-green-dark"
          >
            {forwardLabel}
          </button>
        )}
      </div>
    </section>
  );
};

export default TutorialCallout;
