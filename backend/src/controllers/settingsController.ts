import type { Request, Response } from "express";
import { z } from "zod";
import {
  featuresSchema,
  LockedFeatureError,
  readFeatures,
  writeFeatures,
} from "../settings/features";
import { readRunDefaults, runDefaultsSchema, writeRunDefaults } from "../settings/runDefaults";
import { getErrorMessage } from "../utils/errors";
import { parseBody } from "../validation/validate";

const settingsBodySchema = z.object({ runDefaults: runDefaultsSchema });
const featuresBodySchema = z.object({ features: featuresSchema });

/** GET /api/settings: what every workflow's runs use by default, and which features are on. */
export const getSettings = (_req: Request, res: Response): void => {
  const { features, locked } = readFeatures();
  res.json({ runDefaults: readRunDefaults(), features, lockedFeatures: locked });
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

/** PUT /api/settings/features: switch features on or off (not those the installation fixes). */
export const updateFeatures = (req: Request, res: Response): void => {
  const body = parseBody(featuresBodySchema, req, res);
  if (!body) return;
  try {
    const { features, locked } = writeFeatures(body.features);
    res.json({ features, lockedFeatures: locked });
  } catch (error: unknown) {
    if (error instanceof LockedFeatureError) {
      res.status(409).json({ message: error.message });
      return;
    }
    res.status(500).json({ message: `The features could not be saved: ${getErrorMessage(error)}` });
  }
};
