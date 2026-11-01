import type { Request, Response } from "express";
import { z } from "zod";
import {
  activityEventSchema,
  activitySettingsSchema,
  appendActivity,
  clearActivity,
  readActivity,
  readActivitySettings,
  recordsValues,
  summarizeActivity,
  writeActivitySettings,
} from "../activity/activityLog";
import { readFeatures } from "../settings/features";
import { getErrorMessage } from "../utils/errors";
import { parseBody } from "../validation/validate";

const eventsBodySchema = z.object({ events: z.array(activityEventSchema).max(1_000) });
const settingsBodySchema = z.object({ activityLog: activitySettingsSchema });
const filterSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  test: z.string().max(64).optional(),
});

const isRecording = (): boolean => readFeatures().features.verbose;

/** POST /api/activity: record events (nothing while verbose mode is off). */
export const recordActivity = (req: Request, res: Response): void => {
  const body = parseBody(eventsBodySchema, req, res);
  if (!body) return;
  if (!isRecording()) {
    res.json({ recorded: 0 });
    return;
  }
  try {
    appendActivity(body.events);
    res.json({ recorded: body.events.length });
  } catch (error: unknown) {
    res.status(500).json({ message: `The events could not be recorded: ${getErrorMessage(error)}` });
  }
};

/** GET /api/activity?from=&to=&test=: the recorded events, oldest first. */
export const listActivity = (req: Request, res: Response): void => {
  const filter = filterSchema.safeParse(req.query);
  if (!filter.success) {
    res.status(400).json({ message: "Invalid filter", error: filter.error.issues[0]?.message });
    return;
  }
  res.json({ events: readActivity(filter.data) });
};

/** GET /api/activity/summary: how much is recorded, the marked tests and the log's settings. */
export const getActivitySummary = (_req: Request, res: Response): void => {
  res.json({
    ...summarizeActivity(),
    recording: isRecording(),
    recordsValues: recordsValues(),
    activityLog: readActivitySettings(),
  });
};

/** PUT /api/activity/settings: the retention period. */
export const updateActivitySettings = (req: Request, res: Response): void => {
  const body = parseBody(settingsBodySchema, req, res);
  if (!body) return;
  try {
    writeActivitySettings(body.activityLog);
    res.json({ activityLog: body.activityLog });
  } catch (error: unknown) {
    res.status(500).json({ message: `The settings could not be saved: ${getErrorMessage(error)}` });
  }
};

/** DELETE /api/activity: clear the log. */
export const deleteActivity = (_req: Request, res: Response): void => {
  try {
    clearActivity();
    res.json({ cleared: true });
  } catch (error: unknown) {
    res.status(500).json({ message: `The log could not be cleared: ${getErrorMessage(error)}` });
  }
};
