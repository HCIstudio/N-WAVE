import { Router } from "express";
import {
  analyseWithBioflow,
  analyseWorkflow,
  getAnalysisStatus,
  getBioflowAnalysisStatus,
} from "../controllers/analysisController";

const router: Router = Router();

router.get("/", getAnalysisStatus);
router.post("/", analyseWorkflow);
router.get("/bioflow", getBioflowAnalysisStatus);
router.post("/bioflow", analyseWithBioflow);

export default router;
