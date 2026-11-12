// The home page course (courses/): what the page's parts are for. On a first
// visit it is an offer in the page, between the title and the demos; once
// started, each step points at a part of the page. It ends with the user
// making a workflow of their own: New Workflow, then Demo 1 in its dialog
// (which says so). That workflow opens with the canvas course.

import type React from "react";
import TutorialCallout, { TUTORIAL_BOX_CLASS, TutorialBadge } from "../../components/tutorial/TutorialCallout";
import { Link } from "react-router";
import { dismissIntro, endCourse, setActiveCourse } from "../../courses/courseState";

type Placement = React.ComponentProps<typeof TutorialCallout>["placement"];

interface HomeStep {
  text: React.ReactNode;
  /** `data-tutorial` of what it points at; none: the box in the page (the first step). */
  target?: string;
  placement: Placement;
  /** A task: the page moves on when it is done (no Next). */
  task?: boolean;
}

export const HOME_TUTORIAL_STEPS: HomeStep[] = [
  {
    text: (
      <>
        Welcome to <strong>N-WAVE</strong>: build Nextflow workflows on a canvas, run them, and take them
        out as code. New here? The <strong>first course</strong> (3 minutes) shows you around this page and
        ends with a workflow of your own; the next ones go on from there.
      </>
    ),
    placement: "center",
  },
  {
    text: (
      <>
        The <strong>built-in demos</strong>, from simple text processing to a complete nf-core pipeline.
        They are read-only: make a workflow from one to change it.
      </>
    ),
    target: "demos",
    placement: "below",
  },
  {
    text: (
      <>
        <strong>Your workflows</strong>, each with its last run. Click a card to open it; the buttons at its
        foot rename, duplicate or delete it.
      </>
    ),
    target: "own",
    placement: "above",
  },
  {
    text: (
      <>
        <strong>Import Workflow</strong> reads a Nextflow script, a whole project (zip or folder) or a DAW
        model into a canvas.
      </>
    ),
    target: "import",
    placement: "below",
  },
  {
    text: (
      <>
        The <strong>Wiki</strong>, <strong>Help</strong> (every term N-WAVE uses, explained), the{" "}
        <strong>Courses</strong> and the <strong>Roadmap</strong>.
      </>
    ),
    target: "help",
    placement: "below",
  },
  {
    text: (
      <>
        <strong>Global Settings</strong>: the limits of runs, run profiles (a cluster, for example), which
        features are on, and verbose mode for studies.
      </>
    ),
    target: "settings",
    placement: "below",
  },
  {
    text: (
      <>
        Now make a <strong>workflow of your own</strong>: click <strong>New Workflow</strong>.
      </>
    ),
    target: "new-workflow",
    placement: "above",
    task: true,
  },
  {
    // Shown in the New Workflow dialog (courseHint), not over it.
    text: null,
    placement: "center",
    task: true,
  },
];

/** The step that asks for New Workflow, and the one in its dialog. */
export const NEW_WORKFLOW_STEP = 6;
export const CHOOSE_DEMO_STEP = NEW_WORKFLOW_STEP + 1;

/** What the New Workflow dialog says while the course asks to choose Demo 1. */
export const CHOOSE_DEMO_HINT = (
  <>
    <strong>Choose Demo 1 - Text basics</strong> (outlined): it becomes a workflow of your own, which you can
    change. It opens with the next course, <strong>The canvas</strong>.
  </>
);

const HomeTutorial: React.FC<{
  step: number;
  onStep: (step: number | null) => void;
}> = ({ step, onStep }) => {
  const current = HOME_TUTORIAL_STEPS[Math.min(step, HOME_TUTORIAL_STEPS.length - 1)];
  if (!current || step === CHOOSE_DEMO_STEP) return null;
  const go = (next: number) => {
    setActiveCourse({ course: "home", part: "home", step: next });
    onStep(next);
  };
  // The offer turned down, or the course left: it isn't offered again.
  const skip = () => {
    endCourse("home", false);
    onStep(null);
  };
  // Not started yet: an offer in the page that doesn't cover anything.
  if (step === 0) {
    return (
      <section aria-label="Tutorial" className={`mb-8 max-w-3xl p-4 text-sm ${TUTORIAL_BOX_CLASS}`}>
        <TutorialBadge />
        <p className="leading-5">{current.text}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => go(1)}
            className="rounded-md bg-nextflow-green px-3 py-1.5 text-sm font-medium text-white hover:bg-nextflow-green-dark"
          >
            Start the first course
          </button>
          <Link to="/courses" onClick={dismissIntro} className="rounded-md px-2 py-1.5 text-sm text-text hover:bg-accent">
            All courses
          </Link>
          <button type="button" onClick={skip} className="rounded-md px-2 py-1.5 text-xs text-sky-300 hover:bg-accent">
            Not now
          </button>
        </div>
      </section>
    );
  }
  return (
    <TutorialCallout
      text={current.text}
      targetSelector={current.target ? `[data-tutorial="${current.target}"]` : undefined}
      placement={current.placement}
      progress={`${step} of ${CHOOSE_DEMO_STEP}`}
      canGoBack={step > 1}
      canGoForward={!current.task}
      onBack={() => go(step - 1)}
      onForward={() => go(step + 1)}
      skipLabel="Leave course"
      onSkip={skip}
    />
  );
};

export default HomeTutorial;
