// Where the user is in the tutorial: done (kept in this browser, per version
// of the tutorial), or on a step of its home page tour or its canvas part
// (kept for the tab, across the copy of Demo 1 it continues in).

const COMPLETED_KEY = "nwave.demoTutorial.completed";
const PART_KEY = "nwave.demoTutorial.active";
const STEP_KEY = "nwave.demoTutorial.step";
/** A new version shows the tutorial again to everyone. */
export const TUTORIAL_VERSION = "tour-v4";

export type TutorialPart = "home" | "canvas";

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
    // No storage (private mode): the tutorial only lasts as long as the page.
  }
};

export const tutorialDone = (): boolean => read(() => localStorage, COMPLETED_KEY) === TUTORIAL_VERSION;

/** The step of `part` the user is on, or null when it isn't running. */
export const tutorialStep = (part: TutorialPart): number | null => {
  if (read(() => sessionStorage, PART_KEY) !== part) return null;
  const step = Number(read(() => sessionStorage, STEP_KEY) ?? "0");
  return Number.isFinite(step) && step >= 0 ? step : 0;
};

export const setTutorialStep = (part: TutorialPart, step: number): void => {
  write(() => sessionStorage, PART_KEY, part);
  write(() => sessionStorage, STEP_KEY, String(step));
};

/** Done, or skipped: it doesn't come back. */
export const completeTutorial = (): void => {
  write(() => sessionStorage, PART_KEY, null);
  write(() => sessionStorage, STEP_KEY, null);
  write(() => localStorage, COMPLETED_KEY, TUTORIAL_VERSION);
};

/** Retake it: from the home page tour's first step. */
export const restartTutorial = (): void => {
  write(() => localStorage, COMPLETED_KEY, null);
  setTutorialStep("home", 0);
};
