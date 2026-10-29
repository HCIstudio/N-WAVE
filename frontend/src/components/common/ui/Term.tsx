import type React from "react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { WIKI_PAGES, wikiUrl } from "../../../docs/links";
import { Info } from "lucide-react";
import { glossaryEntry, type GlossaryId } from "../../../glossary/glossary";
import { useFeature } from "../../../settings/useFeatures";

const CARD_WIDTH = 288;

/**
 * A term with an info button after it that explains it: on hover, on focus
 * or on click, with a link to the glossary page. Without children, only the
 * button shows (next to a heading or label that already names the term).
 */
const Term: React.FC<{ id: GlossaryId; children?: React.ReactNode }> = ({ id, children }) => {
  const entry = glossaryEntry(id);
  const cardId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  // Clicked open: stays until clicked again, Escape or a click elsewhere.
  const [pinned, setPinned] = useState(false);
  const glossaryOn = useFeature("glossary");

  const show = () => {
    window.clearTimeout(closeTimer.current);
    if (buttonRef.current) setAnchor(buttonRef.current.getBoundingClientRect());
  };
  const hide = () => {
    setAnchor(null);
    setPinned(false);
  };
  // Hover leaves a moment to reach the card (and its link).
  const hideSoon = () => {
    if (pinned) return;
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(hide, 150);
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!pinned) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || document.getElementById(cardId)?.contains(target)) return;
      setAnchor(null);
      setPinned(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pinned, cardId]);

  const left = anchor
    ? Math.max(8, Math.min(anchor.left - 16, window.innerWidth - CARD_WIDTH - 8))
    : 0;
  // Below the button, or above it near the bottom of the window.
  const below = anchor ? anchor.bottom + 160 < window.innerHeight : true;

  // Global Settings → Features: without the glossary, just the words.
  if (!glossaryOn) return <>{children}</>;

  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <button
        ref={buttonRef}
        type="button"
        aria-label={`About “${entry.term}”`}
        aria-expanded={anchor !== null}
        aria-controls={anchor ? cardId : undefined}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={(event) => {
          if (!document.getElementById(cardId)?.contains(event.relatedTarget as Node)) hideSoon();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (pinned) {
            hide();
          } else {
            show();
            setPinned(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && anchor) {
            event.stopPropagation();
            hide();
          }
        }}
        className="inline-flex shrink-0 items-center rounded-full text-text-light hover:text-nextflow-green focus:outline-none focus-visible:ring-2 focus-visible:ring-nextflow-green"
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      {anchor &&
        createPortal(
          <div
            id={cardId}
            role="dialog"
            aria-label={entry.term}
            onMouseEnter={show}
            onMouseLeave={hideSoon}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                hide();
                buttonRef.current?.focus();
              }
            }}
            style={{
              position: "fixed",
              left,
              width: CARD_WIDTH,
              ...(below
                ? { top: anchor.bottom + 6 }
                : { bottom: window.innerHeight - anchor.top + 6 }),
            }}
            className="z-[1100] rounded-md border border-panel-border bg-panel-background p-3 text-left text-xs font-normal normal-case tracking-normal text-text shadow-lg"
          >
            <p className="font-semibold text-nextflow-green">{entry.term}</p>
            <p className="mt-1 leading-relaxed">{entry.definition}</p>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              <Link
                to={`/help#${entry.id}`}
                target="_blank"
                rel="noreferrer"
                // The card closes when focus leaves its last link.
                onBlur={entry.docs ? undefined : hideSoon}
                className="text-nextflow-green underline-offset-2 hover:underline"
              >
                All terms in the glossary (Help)
              </Link>
              {entry.docs && (
                <a
                  href={wikiUrl(entry.docs)}
                  target="_blank"
                  rel="noreferrer"
                  onBlur={hideSoon}
                  className="text-nextflow-green underline-offset-2 hover:underline"
                >
                  Guide: {WIKI_PAGES[entry.docs.page]}
                </a>
              )}
            </p>
          </div>,
          document.body,
        )}
    </span>
  );
};

export default Term;
