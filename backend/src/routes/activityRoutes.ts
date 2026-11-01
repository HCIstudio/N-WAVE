import { Router } from "express";
import {
  deleteActivity,
  getActivitySummary,
  listActivity,
  recordActivity,
  updateActivitySettings,
} from "../controllers/activityController";

const router: Router = Router();

router.get("/", listActivity);
router.post("/", recordActivity);
router.delete("/", deleteActivity);
router.get("/summary", getActivitySummary);
router.put("/settings", updateActivitySettings);

export default router;
