import { Router } from "express";
import {
  executeProcess,
  checkDockerStatus,
  checkNextflowStatus,
  cancelExecution,
} from "../controllers/executeController";

const router = Router();

router.post("/execute", executeProcess);
router.post("/cancel", cancelExecution);
router.get("/docker-status", checkDockerStatus);
router.get("/nextflow-status", checkNextflowStatus);

export default router;
