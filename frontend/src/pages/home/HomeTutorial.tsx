// The basics course's first part, on the home page (courses/): what its
// parts are for. On a first visit it is an offer in the page, between the
// title and the demos; once started, each step points at a part of the page.
// Its last step makes the user's own copy of Demo 1, where the course goes on
// (courses/courseSteps.tsx), on a canvas they can change.

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
}

export const HOME_TUTORIAL_STEPS: HomeStep[] = [
  {
    text: (
      <>
        Welcome to <strong>N-WAVE</strong>: build Nextflow workflows on a canvas, run them, and take them
        out as code. New here? The <strong>basics course</strong> (5 minutes) shows you the home page, then
        lets you change, add and connect nodes in your own copy of a demo. More courses follow from there.
      </>
    ),
    placement: "center",
  },
  {
    text: (
      <>
        The <strong>built-in demos</strong>, from simple text processing to a complete nf-core pipeline.
        They are read-only: duplicate one to change it.
      </>
    ),
    target: "demos",
    placement: "below",
  },
  {
    text: (
      <>
        <strong>Your workflows</strong>, each with its last run. Click a card to open it; its buttons
        rename, duplicate or delete it.
      </>
    ),
    target: "own",
    placement: "above",
  },
  {
    text: (
      <>
        <strong>New Workflow</strong> starts from a template, an empty canvas, or a copy of a demo.
      </>
    ),
    target: "new-workflow",
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
        The <strong>Wiki</strong>, <strong>Help</strong> (every term N-WAVE uses, explained) and the{" "}
        <strong>Roadmap</strong>.
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
        Now try it: <strong>duplicate Demo 1</strong> to get your own copy. The tour goes on there, on a
        canvas you can change and run.
      </>
    ),
    target: "demo-1",
    placement: "right",
  },
];

const LAST = HOME_TUTORIAL_STEPS.length - 1;

const HomeTutorial: React.FC<{
  step: number;
  onStep: (step: number | null) => void;
  /** Make the copy of Demo 1 and open it; the tutorial goes on there. */
  onDuplicateDemo: () => void;
}> = ({ step, onStep, onDuplicateDemo }) => {
  const current = HOME_TUTORIAL_STEPS[Math.min(step, LAST)];
  if (!current) return null;
  const go = (next: number) => {
    setActiveCourse({ course: "basics", part: "home", step: next });
    onStep(next);
  };
  // The offer turned down, or the course left: it isn't offered again.
  const skip = () => {
    endCourse("basics", false);
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
            Start the basics course
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
      progress={`${step + 1} of ${HOME_TUTORIAL_STEPS.length}`}
      canGoBack={step > 0}
      forwardLabel={step === LAST ? "Duplicate Demo 1" : "Next"}
      onBack={() => go(step - 1)}
      onForward={() => (step === LAST ? onDuplicateDemo() : go(step + 1))}
      skipLabel="Leave course"
      onSkip={skip}
    />
  );
};

export default HomeTutorial;
