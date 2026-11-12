// The running course, as a card on every page: docked at the top left of the
// canvas, where it covers nothing the steps ask for (the + menu is top right,
// panels open on the right), and at the bottom right elsewhere. What a step is
// about is outlined. A task step waits for the user, ticks when done, and goes
// on by itself; on another page, the card says where the step is.

import clsx from "clsx";
import { Check, GraduationCap } from "lucide-react";
import type React from "react";
import { useEffect, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router";
import { isDemoMode } from "../api";
import { wikiUrl } from "../docs/links";
import { courseStage, subscribeCourseStage } from "./courseStage";
import { type CoursePage, courseInfo } from "./courses";
import type { CourseState } from "./useCourse";
import { useStartCourse } from "./useStartCourse";

const TARGET_CLASS = "tutorial-target";

/**
 * Outlines what `selector` points at while it shows (it may appear later, like a node).
 * With `scroll`, it is scrolled into view when found (on a page; never on the canvas,
 * whose pane must not scroll).
 */
const useOutline = (selector: string | undefined, scroll: boolean) => {
  useEffect(() => {
    if (!selector) return;
    let marked: Element | null = null;
    // Again and again: React writes a node's classes anew when it is selected.
    const mark = () => {
      const found = document.querySelector(selector);
      if (found !== marked) {
        marked?.classList.remove(TARGET_CLASS);
        if (scroll) found?.scrollIntoView?.({ block: "center", behavior: "smooth" });
      }
      found?.classList.add(TARGET_CLASS);
      marked = found;
    };
    mark();
    const timer = window.setInterval(mark, 500);
    return () => {
      window.clearInterval(timer);
      marked?.classList.remove(TARGET_CLASS);
    };
  }, [selector, scroll]);
};

const primary = "rounded-md bg-nextflow-green px-3 py-1.5 text-sm font-medium text-white hover:bg-nextflow-green-dark";
const secondary = "rounded-md px-2 py-1.5 text-sm text-text hover:bg-accent";

/** The page a path is: where a step happens, and where the user is. */
const pageOf = (path: string): CoursePage | null =>
  path === "/" ? "home" : path === "/settings" ? "settings" : path.startsWith("/workflow/") ? "workflow" : null;

const PAGE_NAMES: Record<CoursePage, string> = {
  home: "the home page",
  settings: "Global Settings",
  workflow: "your workflow",
};

const CourseCard: React.FC<{ course: CourseState }> = ({ course }) => {
  const { step, index, count, last, justDone } = course;
  const starter = useStartCourse();
  const path = useLocation().pathname;
  const stage = useSyncExternalStore(subscribeCourseStage, courseStage);
  const page = pageOf(path);
  const stepPage = step.page ?? "workflow";
  const elsewhere = page !== stepPage;
  useOutline(elsewhere ? undefined : step.target, page !== "workflow");
  const next = course.course.next ? courseInfo(course.course.next) : null;
  const backTo = stepPage === "home" ? "/" : stepPage === "settings" ? "/settings" : stage.path;

  // On a graph view (not the editor), the card moves down: its title block is at the top left.
  const graphView = page === "workflow" && !stage.editor;

  return (
    <section
      aria-label="Course"
      aria-live="polite"
      className={clsx(
        // Docked where it covers nothing a step asks for: on the canvas, top left
        // (the + menu is top right, panels open on the right); elsewhere, bottom right.
        "fixed z-[75]",
        graphView ? "bottom-20 left-4" : page === "workflow" ? "left-4 top-4" : "bottom-4 right-4",
      )}
    >
      <div className="w-80 rounded-md border border-l-4 border-panel-border border-l-sky-400 bg-panel-background p-4 text-text shadow-[0_12px_40px_rgba(0,0,0,0.6)] ring-1 ring-sky-400/60">
        <div className="flex items-baseline justify-between gap-2">
          <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-sky-300">
            <GraduationCap className="h-3.5 w-3.5" aria-hidden />
            {course.course.title}
          </p>
          <span className="shrink-0 text-xs text-text-light">
            {index + 1} of {count}
          </span>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-accent" aria-hidden>
          {/* The steps done; the last step is the course's end, so the bar is full there. */}
          <div
            data-course-progress
            className="h-full bg-sky-400 transition-all"
            style={{
              width: `${((last ? count : index + (justDone ? 1 : 0)) / count) * 100}%`,
            }}
          />
        </div>
        <p className="mt-2 text-sm leading-5">{step.text}</p>
        {elsewhere && (
          <p className="mt-2 text-xs text-sky-200">
            This step is on {PAGE_NAMES[stepPage]}.{" "}
            {backTo && (
              <Link to={backTo} className="font-medium underline">
                Go there
              </Link>
            )}
          </p>
        )}

        {step.done && (
          <p
            className={clsx(
              "mt-2 flex items-center gap-1.5 text-xs font-medium",
              justDone ? "text-nextflow-green" : "text-amber-300",
            )}
          >
            {justDone ? (
              <>
                <Check className="h-4 w-4" aria-hidden /> Done
              </>
            ) : (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" aria-hidden /> Your turn: the course
                goes on once you&apos;ve done it
              </>
            )}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {index > 0 && !last && (
            <button type="button" onClick={course.back} className={secondary}>
              Back
            </button>
          )}
          {!last && (
            <button
              type="button"
              onClick={course.leave}
              className="rounded-md px-2 py-1.5 text-xs text-sky-300 hover:bg-accent"
            >
              Leave course
            </button>
          )}
          {!last && step.done && !justDone && (
            <button
              type="button"
              onClick={() => course.next()}
              className="ml-auto rounded-md px-2 py-1.5 text-xs text-text-light hover:bg-accent"
            >
              Skip this step
            </button>
          )}
          {!last && !step.done && (
            <button type="button" onClick={() => course.next()} className={clsx(primary, "ml-auto")}>
              Next
            </button>
          )}
          {last && (
            <>
              {next?.course ? (
                <button
                  type="button"
                  disabled={starter.starting}
                  onClick={() => {
                    course.finish();
                    void starter.start(next.course as NonNullable<typeof next.course>);
                  }}
                  className={primary}
                >
                  Next course: {next.title}
                </button>
              ) : isDemoMode ? (
                <a
                  href={wikiUrl({ page: "Installation" })}
                  target="_blank"
                  rel="noreferrer"
                  onClick={course.finish}
                  className={primary}
                >
                  Install N-WAVE
                </a>
              ) : null}
              <Link to="/courses" onClick={course.finish} className={secondary}>
                All courses
              </Link>
              <button
                type="button"
                onClick={course.finish}
                className="rounded-md px-2 py-1.5 text-xs text-sky-300 hover:bg-accent"
              >
                Close
              </button>
            </>
          )}
        </div>
        {starter.error && (
          <p role="alert" className="mt-2 text-xs text-red-400">
            {starter.error}
          </p>
        )}
      </div>
    </section>
  );
};

export default CourseCard;
