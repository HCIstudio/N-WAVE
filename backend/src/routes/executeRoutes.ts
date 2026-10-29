import { Router } from "express";
import {
  cancelExecution,
  checkDockerStatus,
  checkNextflowStatus,
  executeProcess,
  getExecutionLimits,
} from "../controllers/executeController";
import {
  deleteAllCaches,
  deleteWorkflowCache,
  getAllCaches,
  getRunLog,
  getWorkflowCache,
  getRunReport,
  getRunResultFile,
  getRunTrace,
  getRunTaskFile,
  listRunReports,
  listRunResultFiles,
  listRunsHandler,
  listRunTaskFiles,
  listRunTasks,
} from "../controllers/runsController";

const router: Router = Router();

router.post("/execute", executeProcess);
router.post("/cancel", cancelExecution);
router.get("/docker-status", checkDockerStatus);
router.get("/nextflow-status", checkNextflowStatus);
router.get("/limits", getExecutionLimits);
router.get("/runs", listRunsHandler);
router.get("/cache", getWorkflowCache);
router.delete("/cache", deleteWorkflowCache);
router.get("/caches", getAllCaches);
router.delete("/caches", deleteAllCaches);
router.get("/runs/:id/log", getRunLog);
router.get("/runs/:id/files", listRunResultFiles);
// Path-style, so a served report's relative links (report_files/x.png) work.
router.get("/runs/:id/results/*", getRunResultFile);
router.get("/runs/:id/tasks", listRunTasks);
router.get("/runs/:id/reports", listRunReports);
router.get("/runs/:id/reports/:kind", getRunReport);
router.get("/runs/:id/trace", getRunTrace);
router.get("/runs/:id/tasks/:prefix/:rest/files", listRunTaskFiles);
router.get("/runs/:id/tasks/:prefix/:rest/file", getRunTaskFile);
router.get("/runs/:id/tasks/:prefix/:rest/output/*", getRunTaskFile);

export default router;
