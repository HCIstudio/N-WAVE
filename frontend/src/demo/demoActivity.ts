// The browser demo's activity log (verbose mode): kept in this browser's
// local storage, read back like the backend's /api/activity.

import {
  type ActivityEvent,
  type ActivityFilter,
  type ActivitySummary,
  filterActivity,
  markedTests,
} from "../activity/activityEvents";

export const DEMO_ACTIVITY_KEY = "nwave-demo-activity";
export const DEMO_ACTIVITY_SETTINGS_KEY = "nwave-demo-activity-settings";
/** Local storage is small: the oldest events go first beyond this. */
const MAX_EVENTS = 20_000;

const readJson = <T>(key: string, fallback: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? "null") as T | null) ?? fallback;
  } catch {
    return fallback;
  }
};

const retentionDays = (): number | null =>
  readJson<{ retentionDays?: number | null }>(DEMO_ACTIVITY_SETTINGS_KEY, {}).retentionDays ?? null;

const readEvents = (): ActivityEvent[] => {
  const events = readJson<ActivityEvent[]>(DEMO_ACTIVITY_KEY, []);
  const days = retentionDays();
  if (days === null) return events;
  const oldest = Date.now() - days * 86_400_000;
  return events.filter((event) => Date.parse(event.time) >= oldest);
};

const writeEvents = (events: ActivityEvent[]) =>
  localStorage.setItem(DEMO_ACTIVITY_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));

export const demoActivity = {
  /** Kept only while verbose mode is on, as on the backend. */
  record(events: ActivityEvent[], recording: boolean): number {
    if (!recording) return 0;
    writeEvents([...readEvents(), ...events]);
    return events.length;
  },
  list(filter: ActivityFilter): ActivityEvent[] {
    return filterActivity(readEvents(), filter);
  },
  summary(recording: boolean): ActivitySummary {
    const events = readEvents();
    return {
      events: events.length,
      bytes: (localStorage.getItem(DEMO_ACTIVITY_KEY) ?? "").length,
      oldest: events[0]?.time,
      newest: events[events.length - 1]?.time,
      tests: markedTests(events),
      recording,
      recordsValues: false,
      activityLog: { retentionDays: retentionDays() },
    };
  },
  saveSettings(days: number | null) {
    localStorage.setItem(DEMO_ACTIVITY_SETTINGS_KEY, JSON.stringify({ retentionDays: days }));
    writeEvents(readEvents());
  },
  clear() {
    localStorage.removeItem(DEMO_ACTIVITY_KEY);
  },
};
