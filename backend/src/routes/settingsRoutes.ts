import { Router } from "express";
import { getSettings, updateFeatures, updateSettings } from "../controllers/settingsController";

const router: Router = Router();

router.get("/", getSettings);
router.put("/", updateSettings);
router.put("/features", updateFeatures);

export default router;
