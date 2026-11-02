import { Router } from "express";
import {
  getPipelineSchemaHandler,
  getPipelineWorkflowFileHandler,
  listPipelinesHandler,
} from "../controllers/pipelineController";

const router: Router = Router();

router.get("/", listPipelinesHandler);
router.get("/schema", getPipelineSchemaHandler);
router.get("/workflow-file", getPipelineWorkflowFileHandler);

export default router;
