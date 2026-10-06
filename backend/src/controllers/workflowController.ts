import type { Request, Response } from "express";
import WorkflowModel, { type IWorkflow } from "../models/WorkflowModel";
import mongoose from "mongoose";
import { getErrorMessage } from "../utils/errors";
import { createWorkflowSchema, updateWorkflowSchema } from "../validation/schemas";
import { parseBody } from "../validation/validate";
import {
  getBuiltinWorkflowById,
  isBuiltinWorkflowId,
  listBuiltinWorkflows,
  toWorkflowDescriptor,
} from "../workflows";

export const saveWorkflow = async (
  req: Request,
  res: Response
): Promise<void> => {
  const body = parseBody(createWorkflowSchema, req, res);
  if (!body) return;

  try {
    const newWorkflow = new WorkflowModel(body);

    const savedWorkflow = await newWorkflow.save();
    res.status(201).json(toWorkflowDescriptor(savedWorkflow));
  } catch (error: unknown) {
    console.error("Error saving workflow:", error);
    res.status(500).json({
      message: "Server error while saving workflow",
      error: getErrorMessage(error),
    });
  }
};

export const getWorkflowById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const workflowId = req.params.id;

    if (!workflowId) {
      res.status(400).json({ message: "Invalid workflow ID format" });
      return;
    }

    const builtinWorkflow = getBuiltinWorkflowById(workflowId);
    if (builtinWorkflow) {
      res.status(200).json(builtinWorkflow);
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(workflowId)) {
      res.status(400).json({ message: "Invalid workflow ID format" });
      return;
    }

    const workflow: IWorkflow | null = await WorkflowModel.findById(workflowId);

    if (!workflow) {
      res.status(404).json({ message: "Workflow not found" });
      return;
    }

    res.status(200).json(toWorkflowDescriptor(workflow));
  } catch (error: unknown) {
    console.error(`Error fetching workflow by ID ${req.params.id}:`, error);
    res.status(500).json({
      message: "Server error while fetching workflow",
      error: getErrorMessage(error),
    });
  }
};

export const getAllWorkflows = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const workflows: IWorkflow[] = await WorkflowModel.find({});
    const builtinWorkflows = listBuiltinWorkflows();
    res
      .status(200)
      .json([...builtinWorkflows, ...workflows.map((workflow) => toWorkflowDescriptor(workflow))]);
  } catch (error: unknown) {
    console.error("Error fetching all workflows:", error);
    res.status(500).json({
      message: "Server error while fetching all workflows",
      error: getErrorMessage(error),
    });
  }
};

export const updateWorkflow = async (
  req: Request,
  res: Response
): Promise<void> => {
  const body = parseBody(updateWorkflowSchema, req, res);
  if (!body) return;

  try {
    const workflowId = req.params.id;
    const { name, description, nodes, edges, executionSettings } = body;

    if (!workflowId) {
      res.status(400).json({ message: "Invalid workflow ID format" });
      return;
    }

    if (isBuiltinWorkflowId(workflowId)) {
      res.status(403).json({
        message:
          "Built-in workflows are read-only. Duplicate the workflow to create an editable copy.",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(workflowId)) {
      res.status(400).json({ message: "Invalid workflow ID format" });
      return;
    }

    // Partial update: provided nodes/edges replace the stored ones. The schema
    // guarantees at least one field is present.
    const updateData: Partial<IWorkflow> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (nodes !== undefined) updateData.nodes = nodes;
    if (edges !== undefined) updateData.edges = edges;
    if (executionSettings !== undefined)
      updateData.executionSettings = executionSettings;

    const updatedWorkflow: IWorkflow | null =
      await WorkflowModel.findByIdAndUpdate(
        workflowId,
        updateData,
        { new: true, runValidators: true } // new: true returns the modified document
      );

    if (!updatedWorkflow) {
      res.status(404).json({ message: "Workflow not found for update" });
      return;
    }

    res.status(200).json(toWorkflowDescriptor(updatedWorkflow));
  } catch (error: unknown) {
    console.error(`Error updating workflow ${req.params.id}:`, error);
    res.status(500).json({
      message: "Server error while updating workflow",
      error: getErrorMessage(error),
    });
  }
};

export const deleteWorkflow = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const workflowId = req.params.id;

    if (!workflowId) {
      res.status(400).json({ message: "Invalid workflow ID format" });
      return;
    }

    if (isBuiltinWorkflowId(workflowId)) {
      res.status(403).json({
        message:
          "Built-in workflows cannot be deleted. Duplicate the workflow to create an editable copy.",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(workflowId)) {
      res.status(400).json({ message: "Invalid workflow ID format" });
      return;
    }

    const deletedWorkflow: IWorkflow | null =
      await WorkflowModel.findByIdAndDelete(workflowId);

    if (!deletedWorkflow) {
      res.status(404).json({ message: "Workflow not found for deletion" });
      return;
    }

    res.status(200).json({ message: "Workflow deleted successfully" });
  } catch (error: unknown) {
    console.error(`Error deleting workflow ${req.params.id}:`, error);
    res.status(500).json({
      message: "Server error while deleting workflow",
      error: getErrorMessage(error),
    });
  }
};

export const duplicateWorkflow = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const workflowId = req.params.id;

    if (!workflowId) {
      res.status(400).json({ message: "Invalid workflow ID format" });
      return;
    }

    const builtinWorkflow = getBuiltinWorkflowById(workflowId);
    if (builtinWorkflow) {
      const duplicatedWorkflow = new WorkflowModel({
        name: `${builtinWorkflow.name} Copy`,
        description: builtinWorkflow.description,
        nodes: builtinWorkflow.nodes,
        edges: builtinWorkflow.edges,
        executionSettings: builtinWorkflow.executionSettings,
        originType: "imported",
        sourceFormat: builtinWorkflow.origin.sourceFormat,
        sourceKey: builtinWorkflow.origin.sourceKey ?? workflowId,
        rawSource: builtinWorkflow.rawSource ?? null,
        importWarnings: builtinWorkflow.importWarnings ?? [],
        isBuiltin: false,
        isReadOnly: false,
      });

      const savedWorkflow = await duplicatedWorkflow.save();
      res.status(201).json(toWorkflowDescriptor(savedWorkflow));
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(workflowId)) {
      res.status(400).json({ message: "Invalid workflow ID format" });
      return;
    }

    const workflow: IWorkflow | null = await WorkflowModel.findById(workflowId);

    if (!workflow) {
      res.status(404).json({ message: "Workflow not found" });
      return;
    }

    const duplicatedWorkflow = new WorkflowModel({
      name: `${workflow.name ?? "Untitled Workflow"} Copy`,
      description: workflow.description ?? "",
      nodes: workflow.nodes ?? [],
      edges: workflow.edges ?? [],
      executionSettings: workflow.executionSettings,
      originType: "database",
      sourceFormat: workflow.sourceFormat ?? "visual",
      sourceKey: workflow.sourceKey ?? String(workflow._id),
      rawSource: workflow.rawSource ?? null,
      importWarnings: workflow.importWarnings ?? [],
      isBuiltin: false,
      isReadOnly: false,
    });

    const savedWorkflow = await duplicatedWorkflow.save();
    res.status(201).json(toWorkflowDescriptor(savedWorkflow));
  } catch (error: unknown) {
    console.error(`Error duplicating workflow ${req.params.id}:`, error);
    res.status(500).json({
      message: "Server error while duplicating workflow",
      error: getErrorMessage(error),
    });
  }
};
