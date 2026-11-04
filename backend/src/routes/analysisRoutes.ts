import { Router } from "express";
import { analyseWithBioflow, getBioflowAnalysisStatus } from "../controllers/analysisController";

const router: Router = Router();

router.get("/bioflow", getBioflowAnalysisStatus);
router.post("/bioflow", analyseWithBioflow);

export default router;
