import { Router } from "express";
import {
  deleteCustomNode,
  listCustomNodes,
  saveCustomNode,
} from "../controllers/customNodeController";

const router: Router = Router();

router.get("/", listCustomNodes);
router.post("/", saveCustomNode);
router.delete("/:id", deleteCustomNode);

export default router;
