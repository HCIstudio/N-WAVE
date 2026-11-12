// Starting a course: the home page course on the home page; the canvas course
// in a copy of Demo 1 made for it; the nf-core course in an empty workflow.

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import api from "../api";
import { DEFAULT_EXECUTION_SETTINGS } from "../pages/workflow/executionSettings";
import { DEMO_WORKFLOW_ID } from "../demo/demoWorkflow";
import { getApiErrorMessage } from "../utils/errors";
import { type CourseId, setActiveCourse } from "./courseState";

/** The name of the workflow the nf-core course builds. */
export const NFCORE_COURSE_WORKFLOW = "My nf-core quality check";

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
      setStarting(true);
      try {
        // The canvas course in a copy of Demo 1 of its own; the nf-core course in an empty workflow.
        const { data } =
          course === "canvas"
            ? await api.post<{ _id: string }>(`/workflows/${DEMO_WORKFLOW_ID}/duplicate`)
            : await api.post<{ _id: string }>("/workflows", {
                name: NFCORE_COURSE_WORKFLOW,
                nodes: [],
                edges: [],
                description: "Built in the course Build with nf-core modules.",
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
