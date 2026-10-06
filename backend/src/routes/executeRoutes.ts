import { Router } from "express";
import {
  executeProcess,
  checkDockerStatus,
  checkNextflowStatus,
  cancelExecution,
  getRunResultFile,
  listRunResultFiles,
} from "../controllers/executeController";

const router: Router = Router();

router.post("/execute", executeProcess);
router.post("/cancel", cancelExecution);
router.get("/docker-status", checkDockerStatus);
router.get("/nextflow-status", checkNextflowStatus);
router.get("/runs/:id/files", listRunResultFiles);
router.get("/runs/:id/file", getRunResultFile);

export default router;
