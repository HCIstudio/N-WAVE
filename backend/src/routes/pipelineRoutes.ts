import { Router } from "express";
import { getPipelineSchemaHandler } from "../controllers/pipelineController";

const router: Router = Router();

router.get("/schema", getPipelineSchemaHandler);

export default router;
