// The tutorial's first part, on the home page: what its parts are for. Its
// last step makes the user's own copy of Demo 1, where the tutorial goes on
// (useWorkflowTutorial), on a canvas they can change and run.

import type React from "react";
import TutorialCallout from "../../components/tutorial/TutorialCallout";
import { completeTutorial, setTutorialStep } from "../../components/tutorial/tutorialState";

type Placement = React.ComponentProps<typeof TutorialCallout>["placement"];

interface HomeStep {
  text: React.ReactNode;
  /** `data-tutorial` of what it points at; none: the middle of the page. */
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
      onSkip={() => {
        completeTutorial();
        onStep(null);
      }}
    />
  );
};

export default HomeTutorial;
