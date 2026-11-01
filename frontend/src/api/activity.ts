// The activity log of verbose mode (/api/activity; the browser demo keeps it
// in this browser).

import api from "../api";
import type { ActivityEvent, ActivityFilter, ActivitySummary } from "../activity/activityEvents";

export const recordActivity = async (events: ActivityEvent[]): Promise<void> => {
  await api.post("/activity", { events });
};

const query = (filter: ActivityFilter): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : "";
};

export const listActivity = async (filter: ActivityFilter = {}): Promise<ActivityEvent[]> =>
  (await api.get<{ events: ActivityEvent[] }>(`/activity${query(filter)}`)).data.events;

export const getActivitySummary = async (): Promise<ActivitySummary> =>
  (await api.get<ActivitySummary>("/activity/summary")).data;

export const saveActivitySettings = async (retentionDays: number | null): Promise<void> => {
  await api.put("/activity/settings", { activityLog: { retentionDays } });
};

export const clearActivity = async (): Promise<void> => {
  await api.delete("/activity");
};
