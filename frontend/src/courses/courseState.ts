// Where the user is in the courses: the one running in this tab (its part:
// the home page tour or the canvas, and its step), kept for the tab so it
// survives opening a workflow; which courses are finished, and whether the
// first-visit offer was answered, kept in this browser.

export type CourseId =
  | "home"
  | "canvas"
  | "nfcore-modules"
  | "import-export"
  | "own-steps"
  | "large-workflows"
  | "studies"
  | "run"
  | "failures"
  | "pipeline"
  | "clusters"
  | "structure";
export type CoursePart = "home" | "canvas";

export interface ActiveCourse {
  course: CourseId;
  part: CoursePart;
  step: number;
}

const ACTIVE_KEY = "nwave.course.active";
const COMPLETED_KEY = "nwave.courses.completed";
const INTRO_KEY = "nwave.demoTutorial.completed";
/** A new version offers the courses again on the home page to everyone. */
export const INTRO_VERSION = "courses-v2";

const read = (storage: () => Storage, key: string): string | null => {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
};
const write = (storage: () => Storage, key: string, value: string | null) => {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, value);
  } catch {
    // No storage (private mode): the course lasts as long as the page.
  }
};

export const activeCourse = (): ActiveCourse | null => {
  try {
    const value = JSON.parse(read(() => sessionStorage, ACTIVE_KEY) ?? "null") as ActiveCourse | null;
    return value && typeof value.course === "string" && Number.isInteger(value.step) && value.step >= 0 ? value : null;
  } catch {
    return null;
  }
};

/** The step of `part` of the running course, or null when none runs there. */
export const courseStep = (part: CoursePart): { course: CourseId; step: number } | null => {
  const active = activeCourse();
  return active?.part === part ? { course: active.course, step: active.step } : null;
};

/** Sent when the running course changes, so a page already open follows it. */
export const COURSE_CHANGED = "nwave:course-changed";

export const setActiveCourse = (active: ActiveCourse | null): void => {
  write(() => sessionStorage, ACTIVE_KEY, active ? JSON.stringify(active) : null);
  window.dispatchEvent(new Event(COURSE_CHANGED));
};

/** The first-visit offer on the home page was taken or turned down. */
export const introDone = (): boolean => read(() => localStorage, INTRO_KEY) === INTRO_VERSION;
export const dismissIntro = (): void => write(() => localStorage, INTRO_KEY, INTRO_VERSION);

export const completedCourses = (): Set<CourseId> => {
  try {
    return new Set(JSON.parse(read(() => localStorage, COMPLETED_KEY) ?? "[]") as CourseId[]);
  } catch {
    return new Set();
  }
};

/** Finished (or left): it stops; finished, it is marked done. */
export const endCourse = (course: CourseId, finished: boolean): void => {
  setActiveCourse(null);
  dismissIntro();
  if (finished) write(() => localStorage, COMPLETED_KEY, JSON.stringify([...new Set([...completedCourses(), course])]));
};
