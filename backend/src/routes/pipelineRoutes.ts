import { Router } from "express";
import {
  getPipelineSchemaHandler,
  listPipelinesHandler,
} from "../controllers/pipelineController";

const router: Router = Router();

router.get("/", listPipelinesHandler);
router.get("/schema", getPipelineSchemaHandler);

export default router;
