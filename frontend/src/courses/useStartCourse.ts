// Starting a course: the home page course on the home page; the studies course
// in Global Settings; the others in a workflow made for them (a copy of a demo,
// or an empty one).

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import api from "../api";
import { DEMO_WORKFLOW_ID } from "../demo/demoWorkflow";
import { DEFAULT_EXECUTION_SETTINGS } from "../pages/workflow/executionSettings";
import { getApiErrorMessage } from "../utils/errors";
import { type CourseId, setActiveCourse } from "./courseState";

/** The name of the workflow the nf-core course builds. */
export const NFCORE_COURSE_WORKFLOW = "My nf-core quality check";
/** The name of the workflow the own-steps course builds. */
export const OWN_STEPS_COURSE_WORKFLOW = "My own steps";

/** The empty workflows the courses build in: their names and descriptions. */
const EMPTY_WORKFLOWS: Partial<Record<CourseId, { name: string; description: string }>> = {
  "nfcore-modules": {
    name: NFCORE_COURSE_WORKFLOW,
    description: "Built in the course Build with nf-core modules.",
  },
  "own-steps": {
    name: OWN_STEPS_COURSE_WORKFLOW,
    description: "Built in the course Your own steps.",
  },
};

/** Demo 3 (nf-core/rnaseq rebuilt from nodes), which the large-workflows course copies. */
const LARGE_COURSE_DEMO_ID = "builtin:rnaseq-star-salmon";

/** The demos the courses copy. */
const COPIED_DEMOS: Partial<Record<CourseId, string>> = {
  canvas: DEMO_WORKFLOW_ID,
  "import-export": DEMO_WORKFLOW_ID,
  "large-workflows": LARGE_COURSE_DEMO_ID,
};

export const useStartCourse = () => {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (course: CourseId) => {
      setError(null);
      if (course === "home") {
        // The tour's first step after the welcome box.
        setActiveCourse({ course, part: "home", step: 1 });
        navigate("/");
        return;
      }
      if (course === "studies") {
        setActiveCourse({ course, part: "canvas", step: 0 });
        navigate("/settings");
        return;
      }
      setStarting(true);
      try {
        const demo = COPIED_DEMOS[course];
        const empty = EMPTY_WORKFLOWS[course] ?? EMPTY_WORKFLOWS["nfcore-modules"];
        const { data } = demo
          ? await api.post<{ _id: string }>(`/workflows/${demo}/duplicate`)
          : await api.post<{ _id: string }>("/workflows", {
              ...empty,
              nodes: [],
              edges: [],
              executionSettings: DEFAULT_EXECUTION_SETTINGS,
            });
        setActiveCourse({ course, part: "canvas", step: 0 });
        navigate(`/workflow/${data._id}`);
      } catch (caught) {
        setError(getApiErrorMessage(caught, "The course's workflow couldn't be made."));
      } finally {
        setStarting(false);
      }
    },
    [navigate],
  );

  return { start, starting, error };
};
