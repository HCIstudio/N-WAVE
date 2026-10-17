// The demo tutorial on the canvas: its steps, where the user is in it
// (kept in session storage across the copy a read-only demo needs), and
// the callout.

import type React from "react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import api from "../../api";
import TutorialCallout from "../../components/tutorial/TutorialCallout";

const TUTORIAL_COMPLETED_KEY = "nwave.demoTutorial.completed";
const TUTORIAL_ACTIVE_KEY = "nwave.demoTutorial.active";
const TUTORIAL_STEP_KEY = "nwave.demoTutorial.step";
const TUTORIAL_COPY_ID_KEY = "nwave.demoTutorial.copyId";
const TUTORIAL_VERSION = "custom-nodes-v3";

export const tutorialSteps = [
  {
    text: (
      <>
        <strong>Input nodes</strong> hold files to process in the workflow.
      </>
    ),
    targetSelector: '.react-flow__node[data-id="demo-file-input"]',
    placement: "above" as const,
  },
  {
    text: (
      <>
        <strong>Processing nodes</strong> take one or more inputs to alter and
        output the results.
      </>
    ),
    targetSelector: '.react-flow__node[data-id="demo-map-uppercase"]',
    placement: "above" as const,
  },
  {
    text: (
      <>
        <strong>Display nodes</strong> display the input they receive for better
        monitoring. All data going into a Display node will be written as
        workflow result files.
      </>
    ),
    targetSelector: '.react-flow__node[data-id="demo-output"]',
    placement: "above" as const,
  },
  {
    text: (
      <>
        Here you can <strong>rename</strong>, <strong>run</strong>,{" "}
        <strong>save</strong> or <strong>download</strong> your workflow.
      </>
    ),
    targetSelector: "[data-tutorial-bottom-bar]",
    placement: "above" as const,
  },
  {
    text: (
      <>
        To <strong>expand the workflow</strong> click here to see a collection of
        all available nodes. Feel free to select one.
      </>
    ),
    targetSelector: "[data-tutorial-add-node]",
    placement: "left-start" as const,
  },
  {
    text: (
      <>
        To <strong>edit</strong> or <strong>delete</strong> a node or view its
        current configuration, simply double-click it.
      </>
    ),
    targetSelector: '.react-flow__node[data-id="demo-map-uppercase"]',
    placement: "above" as const,
  },
  {
    text: "That covers the basics of N-Wave. Feel free to explore the application. If you have further questions click the home button on the bottom to return to the main page. There you can always retake the tutorial or access our wiki for a more extensive explanation on workflow and node functionality.",
    placement: "center" as const,
  },
];

/** The step that asks the user to add a node. */
const ADD_NODE_STEP = 4;

const markCompleted = () => {
  sessionStorage.removeItem(TUTORIAL_ACTIVE_KEY);
  sessionStorage.removeItem(TUTORIAL_STEP_KEY);
  localStorage.setItem(TUTORIAL_COMPLETED_KEY, TUTORIAL_VERSION);
};

const storedStep = (): number | null => {
  if (sessionStorage.getItem(TUTORIAL_ACTIVE_KEY) !== "true") return null;
  const step = Number(sessionStorage.getItem(TUTORIAL_STEP_KEY) ?? "0");
  return Number.isFinite(step)
    ? Math.min(Math.max(step, 0), tutorialSteps.length - 1)
    : 0;
};

interface Options {
  workflowId: string | undefined;
  readOnly: boolean;
  duplicateReadOnlyWorkflow: (options?: {
    onCopied?: (copyId: string) => void;
  }) => Promise<boolean>;
  showError: (message: string) => void;
}

export const useWorkflowTutorial = ({
  workflowId,
  readOnly,
  duplicateReadOnlyWorkflow,
  showError,
}: Options) => {
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState(storedStep);

  const setStep = useCallback((step: number | null) => {
    if (step === null) {
      markCompleted();
      setStepIndex(null);
      return;
    }
    sessionStorage.setItem(TUTORIAL_ACTIVE_KEY, "true");
    sessionStorage.setItem(TUTORIAL_STEP_KEY, String(step));
    setStepIndex(step);
  }, []);

  /** Copy the read-only demo, remembering the copy to remove it at the end. */
  const duplicateForTutorial = useCallback(
    () =>
      duplicateReadOnlyWorkflow({
        onCopied: (copyId) =>
          sessionStorage.setItem(TUTORIAL_COPY_ID_KEY, copyId),
      }),
    [duplicateReadOnlyWorkflow],
  );

  /**
   * Adding a node completes the add-node step. In a read-only demo the
   * node can't be added: the tutorial continues in an editable copy.
   * Returns whether the tutorial took over (the caller adds nothing).
   */
  const onAddNode = useCallback(() => {
    if (stepIndex !== ADD_NODE_STEP) return false;
    setStep(ADD_NODE_STEP + 1);
    if (!readOnly) return false;
    void duplicateForTutorial();
    return true;
  }, [stepIndex, readOnly, setStep, duplicateForTutorial]);

  const back = useCallback(() => {
    setStepIndex((current) => {
      if (current === null) return current;
      const previous = Math.max(current - 1, 0);
      sessionStorage.setItem(TUTORIAL_STEP_KEY, String(previous));
      return previous;
    });
  }, []);

  const forward = useCallback(() => {
    if (stepIndex === ADD_NODE_STEP && readOnly) {
      setStep(ADD_NODE_STEP + 1);
      void duplicateForTutorial().then((duplicated) => {
        if (!duplicated) setStep(ADD_NODE_STEP);
      });
      return;
    }
    setStepIndex((current) => {
      if (current === null) return current;
      if (current >= tutorialSteps.length - 1) {
        markCompleted();
        return null;
      }
      const next = current + 1;
      sessionStorage.setItem(TUTORIAL_STEP_KEY, String(next));
      return next;
    });
  }, [stepIndex, readOnly, setStep, duplicateForTutorial]);

  /** End the tutorial and remove the copy it made. */
  const finish = useCallback(async () => {
    const copyId = sessionStorage.getItem(TUTORIAL_COPY_ID_KEY);
    markCompleted();
    sessionStorage.removeItem(TUTORIAL_COPY_ID_KEY);
    setStepIndex(null);
    if (!copyId) return;
    try {
      await api.delete(`/workflows/${copyId}`);
      if (workflowId === copyId) navigate("/");
    } catch (error) {
      showError("Failed to remove tutorial workflow copy.");
      console.error(error);
    }
  }, [navigate, workflowId, showError]);

  return { stepIndex, onAddNode, back, forward, finish };
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
      canGoBack={stepIndex > 0}
      canGoForward={!isLast}
      skipLabel={isLast ? "Finish Tutorial" : "Skip Tutorial"}
      onBack={tutorial.back}
      onForward={tutorial.forward}
      onSkip={() => {
        void tutorial.finish();
      }}
    />
  );
};
