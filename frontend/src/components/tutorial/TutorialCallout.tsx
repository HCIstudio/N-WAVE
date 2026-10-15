import type React from "react";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

type AnchorPlacement = "above" | "left" | "left-start" | "right" | "center";

interface TutorialCalloutProps {
  text: React.ReactNode;
  targetSelector?: string;
  placement?: AnchorPlacement;
  canGoBack?: boolean;
  canGoForward?: boolean;
  skipLabel?: string;
  onBack?: () => void;
  onForward?: () => void;
  onSkip?: () => void;
}

const CALLOUT_WIDTH = 320;

/** Look shared by every tutorial box (here and on the home page). */
export const TUTORIAL_BOX_CLASS =
  "rounded-lg border-2 border-sky-400/70 bg-gradient-to-br from-sky-950 via-background to-violet-950 text-text shadow-2xl shadow-sky-500/20";

/** Small "Tutorial" label at the top of a tutorial box. */
export const TutorialBadge: React.FC = () => (
  <span className="mb-2 inline-flex items-center gap-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
    <Sparkles size={12} aria-hidden />
    Tutorial
  </span>
);

const TutorialCallout: React.FC<TutorialCalloutProps> = ({
  text,
  targetSelector,
  placement = "above",
  canGoBack = true,
  canGoForward = true,
  skipLabel = "Skip Tutorial",
  onBack,
  onForward,
  onSkip,
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });

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

      const rect = target.getBoundingClientRect();
      const viewportPadding = 16;
      const left =
        placement === "right"
          ? rect.right + 12
          : placement === "left" || placement === "left-start"
            ? rect.left - CALLOUT_WIDTH - 12
            : rect.left + rect.width / 2 - CALLOUT_WIDTH / 2;
      const top =
        placement === "left-start"
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
        : placement === "left-start"
          ? "none"
        : "translateY(-50%)";

  return (
    <section
      aria-label="Tutorial"
      aria-live="polite"
      className={`fixed z-50 w-[320px] p-4 ${TUTORIAL_BOX_CLASS}`}
      style={{ top: position.top, left: position.left, transform }}
    >
      <TutorialBadge />
      <p className="text-sm leading-5">{text}</p>
      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          className="rounded-md p-1.5 text-sky-200 hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Previous tutorial step"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-amber-300 hover:bg-amber-400/15"
        >
          {skipLabel}
        </button>
        {canGoForward && (
          <button
            type="button"
            onClick={onForward}
            className="rounded-md p-1.5 text-sky-200 hover:bg-sky-400/15"
            aria-label="Next tutorial step"
          >
            <ChevronRight size={18} />
          </button>
        )}
      </div>
    </section>
  );
};

export default TutorialCallout;
