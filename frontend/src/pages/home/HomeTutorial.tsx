// The tutorial's first part, on the home page: what its parts are for. It
// starts as a box in the page, between the title and the demos; once the user
// starts the tour, each step points at a part of the page. Its last step makes
// the user's own copy of Demo 1, where the tutorial goes on
// (useWorkflowTutorial), on a canvas they can change and run.

import type React from "react";
import TutorialCallout, { TUTORIAL_BOX_CLASS, TutorialBadge } from "../../components/tutorial/TutorialCallout";
import { completeTutorial, setTutorialStep } from "../../components/tutorial/tutorialState";

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
        out as code. This short tour shows the home page, then goes on in your own copy of a demo.
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
    setTutorialStep("home", next);
    onStep(next);
  };
  const skip = () => {
    completeTutorial();
    onStep(null);
  };
  // Not started yet: a box in the page that doesn't cover anything.
  if (step === 0) {
    return (
      <section aria-label="Tutorial" className={`mb-8 max-w-3xl p-4 text-sm ${TUTORIAL_BOX_CLASS}`}>
        <TutorialBadge />
        <p className="leading-5">{current.text}</p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(1)}
            className="rounded-md bg-nextflow-green px-3 py-1.5 text-sm font-medium text-white hover:bg-nextflow-green-dark"
          >
            Start the tour
          </button>
          <button type="button" onClick={skip} className="rounded-md px-2 py-1.5 text-xs text-sky-300 hover:bg-accent">
            Skip tutorial
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
      onSkip={skip}
    />
  );
};

export default HomeTutorial;
