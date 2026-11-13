// Starting a course: the home page course on the home page; the studies course
// in Global Settings; the others in a workflow made for them (a copy of a demo,
// a Nextflow script imported for it, or an empty workflow).

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";
import api from "../api";
import { DEMO_WORKFLOW_ID } from "../demo/demoWorkflow";
import { RNASEQ_EXAMPLE_ID } from "../demo/rnaseqExample";
import { DEFAULT_EXECUTION_SETTINGS } from "../pages/workflow/executionSettings";
import { getApiErrorMessage } from "../utils/errors";
import { importNextflowWorkflow } from "../workflows/importNextflowWorkflow";
import { type CourseId, setActiveCourse } from "./courseState";
import { BRANCHES_SCRIPT, FAILING_SCRIPT, STRUCTURE_SCRIPT } from "./courseWorkflows";

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
  run: DEMO_WORKFLOW_ID,
  pipeline: RNASEQ_EXAMPLE_ID,
  clusters: DEMO_WORKFLOW_ID,
};

/** The Nextflow scripts courses import, with the workflow's name and description. */
const IMPORTED_SCRIPTS: Partial<Record<CourseId, { name: string; description: string; rawSource: string }>> = {
  failures: {
    name: "A run that fails",
    description: "Imported for the course When a run fails.",
    rawSource: FAILING_SCRIPT,
  },
  branches: {
    name: "Two aligners, one to choose",
    description: "Imported for the course Choices in a workflow.",
    rawSource: BRANCHES_SCRIPT,
  },
  structure: {
    name: "Two aligners",
    description: "Imported for the course Read a workflow's structure.",
    rawSource: STRUCTURE_SCRIPT,
  },
};

/** The workflow a course works in: a copy of a demo, an imported script, or an empty workflow. */
const makeWorkflow = async (course: CourseId): Promise<string> => {
  const demo = COPIED_DEMOS[course];
  if (demo) return (await api.post<{ _id: string }>(`/workflows/${demo}/duplicate`)).data._id;
  const script = IMPORTED_SCRIPTS[course];
  if (script) return (await api.post<{ _id: string }>("/workflows", await importNextflowWorkflow(script))).data._id;
  const empty = EMPTY_WORKFLOWS[course] ?? EMPTY_WORKFLOWS["nfcore-modules"];
  const { data } = await api.post<{ _id: string }>("/workflows", {
    ...empty,
    nodes: [],
    edges: [],
    executionSettings: DEFAULT_EXECUTION_SETTINGS,
  });
  return data._id;
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
        const id = await makeWorkflow(course);
        setActiveCourse({ course, part: "canvas", step: 0 });
        navigate(`/workflow/${id}`);
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
