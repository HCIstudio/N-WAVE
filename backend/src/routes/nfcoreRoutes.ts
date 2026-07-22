import { Router } from "express";
import {
  installNfCoreModule,
  listInstalledNfCoreModules,
  listNfCoreCatalog,
} from "../controllers/nfcoreController";

const router: Router = Router();

router.get("/catalog", listNfCoreCatalog);
router.get("/installed", listInstalledNfCoreModules);
router.post("/install", installNfCoreModule);

export default router;
