// The tutorial's second part, on the canvas of the user's own copy of
// Demo 1 (the home page tour makes it): the parts of a workflow, and things
// to try on a canvas that can be changed and run. Its step is kept for the
// tab (components/tutorial/tutorialState.ts).

import type React from "react";
import { useCallback, useState } from "react";
import TutorialCallout from "../../components/tutorial/TutorialCallout";
import { completeTutorial, setTutorialStep, tutorialStep } from "../../components/tutorial/tutorialState";

export const tutorialSteps = [
  {
    text: (
      <>
        This is <strong>your copy</strong> of Demo 1: change anything, the demo stays as it is.{" "}
        <strong>Input nodes</strong> bring data in; this File Input holds a sample text file.
      </>
    ),
    targetSelector: '.react-flow__node[data-id="demo-file-input"]',
    placement: "above" as const,
  },
  {
    text: (
      <>
        <strong>Steps</strong> process what they get. Try it: double-click <strong>Map</strong> and
        change its case to lowercase. The nodes after it show the result straight away.
      </>
    ),
    targetSelector: '.react-flow__node[data-id="demo-map-uppercase"]',
    placement: "above" as const,
  },
  {
    text: (
      <>
        <strong>Display Output</strong> shows what reaches it. In a run, everything that goes into it is
        saved as the workflow's results.
      </>
    ),
    targetSelector: '.react-flow__node[data-id="demo-output"]',
    placement: "above" as const,
  },
  {
    text: (
      <>
        <strong>Add a node</strong>: the + opens the library (nf-core tools, operators, your own
        processes). Connect it by dragging from an output dot to an input dot.
      </>
    ),
    targetSelector: "[data-tutorial-add-node]",
    placement: "left-start" as const,
  },
  {
    text: (
      <>
        The <strong>bottom bar</strong>: rename the workflow, switch between the editor and the process
        graph, check it, <strong>run</strong> it, <strong>export</strong> it as code or a diagram, and
        save it.
      </>
    ),
    targetSelector: "[data-tutorial-bottom-bar]",
    placement: "above" as const,
  },
  {
    text: (
      <>
        Zoom, undo and redo, the keyboard shortcuts, and <strong>Help</strong>, where every term is
        explained.
      </>
    ),
    targetSelector: "[data-canvas-controls]",
    placement: "above" as const,
  },
  {
    text: "That's the basics. This copy is yours to try things in; you'll find it under Your workflows. Retake the tutorial from the home page at any time, and see the wiki for more.",
    placement: "center" as const,
  },
];

/** The step that asks the user to add a node: adding one moves on. */
const ADD_NODE_STEP = 3;

export const useWorkflowTutorial = () => {
  const [stepIndex, setStepIndex] = useState(() => {
    const step = tutorialStep("canvas");
    return step === null ? null : Math.min(step, tutorialSteps.length - 1);
  });

  const go = useCallback((step: number | null) => {
    if (step === null || step >= tutorialSteps.length) {
      completeTutorial();
      setStepIndex(null);
      return;
    }
    setTutorialStep("canvas", step);
    setStepIndex(step);
  }, []);

  /** Adding a node completes the add-node step (the node is added as usual). */
  const onAddNode = useCallback(() => {
    if (stepIndex === ADD_NODE_STEP) go(ADD_NODE_STEP + 1);
  }, [stepIndex, go]);

  return {
    stepIndex,
    onAddNode,
    back: () => stepIndex !== null && go(Math.max(stepIndex - 1, 0)),
    forward: () => stepIndex !== null && go(stepIndex + 1),
    finish: () => go(null),
  };
};

export const WorkflowTutorial: React.FC<{
  tutorial: ReturnType<typeof useWorkflowTutorial>;
}> = ({ tutorial }) => {
  const { stepIndex } = tutorial;
  if (stepIndex === null) return null;
  const step = tutorialSteps[stepIndex];
  const isLast = stepIndex === tutorialSteps.length - 1;
  return (
    <TutorialCallout
      text={step.text}
      targetSelector={"targetSelector" in step ? step.targetSelector : undefined}
      placement={step.placement}
      progress={`${stepIndex + 1} of ${tutorialSteps.length}`}
      canGoBack={stepIndex > 0}
      forwardLabel={isLast ? "Finish" : "Next"}
      skipLabel={isLast ? "Close" : "Skip tutorial"}
      onBack={tutorial.back}
      onForward={tutorial.forward}
      onSkip={tutorial.finish}
    />
  );
};
