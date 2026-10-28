import type { Request, Response } from "express";
import { z } from "zod";
import { readRunDefaults, runDefaultsSchema, writeRunDefaults } from "../settings/runDefaults";
import { getErrorMessage } from "../utils/errors";
import { parseBody } from "../validation/validate";

const settingsBodySchema = z.object({ runDefaults: runDefaultsSchema });

/** GET /api/settings: what every workflow's runs use by default. */
export const getSettings = (_req: Request, res: Response): void => {
  res.json({ runDefaults: readRunDefaults() });
};

/** PUT /api/settings: replace the run defaults. */
export const updateSettings = (req: Request, res: Response): void => {
  const body = parseBody(settingsBodySchema, req, res);
  if (!body) return;
  try {
    writeRunDefaults(body.runDefaults);
    res.json({ runDefaults: body.runDefaults });
  } catch (error: unknown) {
    res.status(500).json({ message: `The settings could not be saved: ${getErrorMessage(error)}` });
  }
};
