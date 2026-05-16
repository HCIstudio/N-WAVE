import { Request, Response } from "express";
import WorkflowModel, { IWorkflow } from "../models/WorkflowModel";
import mongoose from "mongoose";
import {
  getBuiltinWorkflowById,
  isBuiltinWorkflowId,
  listBuiltinWorkflows,
  toWorkflowDescriptor,
} from "../workflows";
import { importNextflowWorkflow } from "../workflows/importNextflowWorkflow";

export const saveWorkflow = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const {
      name,
      description,
      nodes,
      edges,
      executionSettings,
      originType,
      sourceFormat,
      sourceKey,
      rawSource,
      importWarnings,
      isBuiltin,
      isReadOnly,
    } = req.body;

    // Basic validation
    if (!nodes || !edges) {
      res.status(400).json({ message: "Nodes and edges are required" });
      return;
    }

    const newWorkflow = new WorkflowModel({
      name,
      description,
      nodes,
      edges,
      executionSettings,
      originType,
      sourceFormat,
      sourceKey,
      rawSource,
      importWarnings,
      isBuiltin,
      isReadOnly,
    });

    const savedWorkflow = await newWorkflow.save();
    res.status(201).json(toWorkflowDescriptor(savedWorkflow));
  } catch (error: any) {
    console.error("Error saving workflow:", error);
    res.status(500).json({
      message: "Server error while saving workflow",
      error: error.message,
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
  } catch (error: any) {
    console.error(`Error fetching workflow by ID ${req.params.id}:`, error);
    res.status(500).json({
      message: "Server error while fetching workflow",
      error: error.message,
    });
  }
};

export const getAllWorkflows = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const workflows: IWorkflow[] = await WorkflowModel.find({});
    const builtinWorkflows = listBuiltinWorkflows();
    res
      .status(200)
      .json([...builtinWorkflows, ...workflows.map((workflow) => toWorkflowDescriptor(workflow))]);
  } catch (error: any) {
    console.error("Error fetching all workflows:", error);
    res.status(500).json({
      message: "Server error while fetching all workflows",
      error: error.message,
    });
  }
};

export const updateWorkflow = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const workflowId = req.params.id;
    const { name, description, nodes, edges, executionSettings } = req.body;

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

    // Basic validation for update data (at least one field should be present if we want to be strict)
    // For now, we allow partial updates. If nodes/edges are provided, they replace the old ones.
    // If name is provided, it updates the name.

    const updateData: Partial<IWorkflow> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (nodes !== undefined) updateData.nodes = nodes;
    if (edges !== undefined) updateData.edges = edges;
    if (executionSettings !== undefined)
      updateData.executionSettings = executionSettings;

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ message: "No update data provided" });
      return;
    }

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
  } catch (error: any) {
    console.error(`Error updating workflow ${req.params.id}:`, error);
    res.status(500).json({
      message: "Server error while updating workflow",
      error: error.message,
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
  } catch (error: any) {
    console.error(`Error deleting workflow ${req.params.id}:`, error);
    res.status(500).json({
      message: "Server error while deleting workflow",
      error: error.message,
    });
  }
};

export const importWorkflow = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, description, rawSource, sourceKey } = req.body;

    const importedWorkflow = importNextflowWorkflow({
      name,
      description,
      rawSource,
      sourceKey,
    });

    const savedWorkflow = await new WorkflowModel(importedWorkflow).save();
    res.status(201).json(toWorkflowDescriptor(savedWorkflow));
  } catch (error: any) {
    console.error("Error importing workflow:", error);
    const statusCode =
      typeof error?.message === "string" &&
      error.message.toLowerCase().includes("required")
        ? 400
        : 500;

    res.status(statusCode).json({
      message:
        statusCode === 400
          ? "Invalid workflow import payload"
          : "Server error while importing workflow",
      error: error.message,
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
  } catch (error: any) {
    console.error(`Error duplicating workflow ${req.params.id}:`, error);
    res.status(500).json({
      message: "Server error while duplicating workflow",
      error: error.message,
    });
  }
};
