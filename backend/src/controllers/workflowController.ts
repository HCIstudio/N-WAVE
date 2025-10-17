import { Request, Response } from "express";
import WorkflowModel, { IWorkflow } from "../models/WorkflowModel";
import mongoose from "mongoose";

export const saveWorkflow = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, description, nodes, edges, executionSettings } = req.body;

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
    });

    const savedWorkflow = await newWorkflow.save();
    res.status(201).json(savedWorkflow);
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

    if (!workflowId || !mongoose.Types.ObjectId.isValid(workflowId)) {
      res.status(400).json({ message: "Invalid workflow ID format" });
      return;
    }

    const workflow: IWorkflow | null = await WorkflowModel.findById(workflowId);

    if (!workflow) {
      res.status(404).json({ message: "Workflow not found" });
      return;
    }

    res.status(200).json(workflow);
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
    res.status(200).json(workflows);
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

    if (!workflowId || !mongoose.Types.ObjectId.isValid(workflowId)) {
      res.status(400).json({ message: "Invalid workflow ID format" });
      return;
    }

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
        { new: true, runValidators: true }
      );

    if (!updatedWorkflow) {
      res.status(404).json({ message: "Workflow not found for update" });
      return;
    }

    res.status(200).json(updatedWorkflow);
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

    if (!workflowId || !mongoose.Types.ObjectId.isValid(workflowId)) {
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

