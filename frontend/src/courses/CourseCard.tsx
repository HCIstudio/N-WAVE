// The running course on the canvas, as a card docked at the top left, where
// it covers nothing the steps ask for (the + menu is top right, panels open
// on the right). What a step is about is outlined on the canvas. A task step
// waits for the user, ticks when done, and goes on by itself.

import clsx from "clsx";
import { Check, GraduationCap } from "lucide-react";
import type React from "react";
import { useEffect } from "react";
import { Link } from "react-router";
import { isDemoMode } from "../api";
import { wikiUrl } from "../docs/links";
import { courseInfo } from "./courses";
import type { CourseState } from "./useCourse";
import { useStartCourse } from "./useStartCourse";

const TARGET_CLASS = "tutorial-target";

/** Outlines what `selector` points at while it shows (it may appear later, like a node). */
const useOutline = (selector: string | undefined) => {
  useEffect(() => {
    if (!selector) return;
    let marked: Element | null = null;
    // Again and again: React writes a node's classes anew when it is selected.
    const mark = () => {
      const found = document.querySelector(selector);
      if (found !== marked) marked?.classList.remove(TARGET_CLASS);
      found?.classList.add(TARGET_CLASS);
      marked = found;
    };
    mark();
    const timer = window.setInterval(mark, 500);
    return () => {
      window.clearInterval(timer);
      marked?.classList.remove(TARGET_CLASS);
    };
  }, [selector]);
};

const primary = "rounded-md bg-nextflow-green px-3 py-1.5 text-sm font-medium text-white hover:bg-nextflow-green-dark";
const secondary = "rounded-md px-2 py-1.5 text-sm text-text hover:bg-accent";

const CourseCard: React.FC<{ course: CourseState }> = ({ course }) => {
  const { step, index, count, last, justDone } = course;
  const starter = useStartCourse();
  useOutline(step.target);
  const next = course.course.next ? courseInfo(course.course.next) : null;

  return (
    <section
      aria-label="Course"
      aria-live="polite"
      className="absolute left-4 top-4 z-30 w-80 rounded-md border border-l-4 border-panel-border border-l-sky-400 bg-panel-background p-4 text-text shadow-[0_12px_40px_rgba(0,0,0,0.6)] ring-1 ring-sky-400/60"
    >
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
        <div className="h-full bg-sky-400 transition-all" style={{ width: `${((index + (justDone ? 1 : 0)) / count) * 100}%` }} />
      </div>
      <p className="mt-2 text-sm leading-5">{step.text}</p>

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
              <span className="h-2 w-2 animate-pulse rounded-full bg-amber-300" aria-hidden /> Your turn: the course goes
              on once you&apos;ve done it
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
          <button type="button" onClick={course.leave} className="rounded-md px-2 py-1.5 text-xs text-sky-300 hover:bg-accent">
            Leave course
          </button>
        )}
        {!last && step.done && !justDone && (
          <button type="button" onClick={() => course.next()} className="ml-auto rounded-md px-2 py-1.5 text-xs text-text-light hover:bg-accent">
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
            <button type="button" onClick={course.finish} className="rounded-md px-2 py-1.5 text-xs text-sky-300 hover:bg-accent">
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
    </section>
  );
};

export default CourseCard;
