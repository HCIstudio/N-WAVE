// The course running on the canvas (courseState.ts): its step, kept for the
// tab; a task step goes on by itself once the user has done what it asks,
// judged from the canvas, the open panels and the controls clicked since the
// step began. Shown by CourseCard, docked so it covers nothing to work with.

import type { Edge, Node } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { describeClick } from "../activity/useClickRecorder";
import type { NodeData } from "../components/nodes/BaseNode";
import { COURSE_STEPS } from "./courseSteps";
import { courseInfo } from "./courses";
import { type CourseId, courseStep, endCourse, setActiveCourse } from "./courseState";

/** How long a done task shows its tick before the next step. */
export const DONE_PAUSE_MS = 900;

export const useCourse = ({
  nodes,
  edges,
  openPanels,
}: {
  nodes: Node<NodeData>[];
  edges: Edge[];
  openPanels: string[];
}) => {
  const [state, setState] = useState(() => {
    const found = courseStep("canvas");
    return found ? { ...found, step: Math.min(found.step, COURSE_STEPS[found.course].length - 1) } : null;
  });
  const [clicked, setClicked] = useState<Set<string>>(() => new Set());
  const [justDone, setJustDone] = useState(false);
  const steps = state ? COURSE_STEPS[state.course] : [];
  const step = state ? steps[state.step] : undefined;

  const go = useCallback((course: CourseId, next: number) => {
    setClicked(new Set());
    setJustDone(false);
    setActiveCourse({ course, part: "canvas", step: next });
    setState({ course, step: next });
  }, []);

  // The controls clicked during a step (what a task can ask for, like "open the + menu"),
  // listened to all along the course: a click right after a step shows still counts.
  const running = state !== null;
  useEffect(() => {
    if (!running) return;
    const onClick = (event: MouseEvent) => {
      const name = describeClick(event.target)?.name;
      if (name) setClicked((current) => (current.has(name) ? current : new Set([...current, name])));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [running]);

  // A task done: a moment to see the tick, then the next step.
  const done = useMemo(
    () => Boolean(step?.done?.({ nodes, edges, openPanels, clicked })),
    [step, nodes, edges, openPanels, clicked],
  );
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!state || !done || justDone) return;
    setJustDone(true);
    timer.current = window.setTimeout(() => go(state.course, state.step + 1), DONE_PAUSE_MS);
  }, [state, done, justDone, go]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  if (!state || !step) return null;
  const last = state.step === steps.length - 1;
  return {
    course: courseInfo(state.course),
    step,
    index: state.step,
    count: steps.length,
    last,
    /** The task of this step is done (the next step comes in a moment). */
    justDone,
    back: () => go(state.course, Math.max(state.step - 1, 0)),
    next: () => (last ? null : go(state.course, state.step + 1)),
    /** Finished: marked done. */
    finish: () => {
      endCourse(state.course, true);
      setState(null);
    },
    /** Left before its end. */
    leave: () => {
      endCourse(state.course, false);
      setState(null);
    },
  };
};

export type CourseState = NonNullable<ReturnType<typeof useCourse>>;
