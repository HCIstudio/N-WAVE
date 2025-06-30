import express from "express";
import {
  saveWorkflow,
  getWorkflowById,
  getAllWorkflows,
  updateWorkflow,
  deleteWorkflow,
} from "../controllers/workflowController";

const router = express.Router();

// @route   POST /api/workflows
// @desc    Save a new workflow
// @access  Public (for now, can add auth later)
router.post("/", saveWorkflow);

// @route   GET /api/workflows
// @desc    Get all workflows
// @access  Public
router.get("/", getAllWorkflows);

// @route   GET /api/workflows/:id
// @desc    Get a specific workflow by its ID
// @access  Public
router.get("/:id", getWorkflowById);

// @route   PUT /api/workflows/:id
// @desc    Update an existing workflow
router.put("/:id", updateWorkflow);

// @route   DELETE /api/workflows/:id
// @desc    Delete a workflow
router.delete("/:id", deleteWorkflow);

// We will add other routes like GET / etc. later

export default router;
