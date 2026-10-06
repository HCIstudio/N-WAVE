import { Router } from "express";
import {
  getNfCoreModuleSource,
  installNfCoreModule,
  listInstalledNfCoreModules,
  listNfCoreCatalog,
} from "../controllers/nfcoreController";

const router: Router = Router();

router.get("/catalog", listNfCoreCatalog);
router.get("/installed", listInstalledNfCoreModules);
router.post("/install", installNfCoreModule);
router.get("/modules/source", getNfCoreModuleSource);

export default router;
