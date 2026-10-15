import { Router } from "express";
import {
  executeProcess,
  checkDockerStatus,
  checkNextflowStatus,
  cancelExecution,
  getExecutionLimits,
  getRunLog,
  getRunResultFile,
  listRunResultFiles,
  listRunsHandler,
} from "../controllers/executeController";

const router: Router = Router();

router.post("/execute", executeProcess);
router.post("/cancel", cancelExecution);
router.get("/docker-status", checkDockerStatus);
router.get("/nextflow-status", checkNextflowStatus);
router.get("/limits", getExecutionLimits);
router.get("/runs", listRunsHandler);
router.get("/runs/:id/log", getRunLog);
router.get("/runs/:id/files", listRunResultFiles);
router.get("/runs/:id/file", getRunResultFile);

export default router;
