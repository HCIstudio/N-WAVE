// Verbose mode in tests: turn recording on (or off) and read what was recorded.
// Not used by the app itself.

import type { ActivityEvent, ActivityType } from "./activityEvents";
import { pendingActivity, resetActivityLog } from "./activityLog";
import type { Features } from "../api/settings";
import { resetFeatures } from "../settings/useFeatures";

/** Start recording from scratch (verbose mode on unless `features` says otherwise). */
export const startRecording = (features: Partial<Features> = {}, recordsValues = false): void => {
  resetFeatures({ verbose: true, ...features }, [], recordsValues);
  resetActivityLog();
};

export const stopRecording = (): void => {
  resetActivityLog();
  resetFeatures();
};

/** The events recorded so far, of one type or all (without the session.started one). */
export const recorded = (type?: ActivityType): ActivityEvent[] =>
  pendingActivity().filter((event) => (type ? event.type === type : event.type !== "session.started"));
