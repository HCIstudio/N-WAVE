import type { Request, Response } from "express";
import mongoose from "mongoose";
import WorkflowModel, { type IWorkflow } from "../models/WorkflowModel";
import { getErrorMessage } from "../utils/errors";
import { createWorkflowSchema, updateWorkflowSchema } from "../validation/schemas";
import { parseBody } from "../validation/validate";
import {
  getBuiltinWorkflowById,
  isBuiltinWorkflowId,
  listBuiltinWorkflows,
  toWorkflowDescriptor,
} from "../workflows";
import { atRevision, revisionOf, withNextRevision } from "../workflows/revisions";

/** 500, with what went wrong while `doing` it. */
const serverError = (res: Response, doing: string, error: unknown, logged: string): void => {
  console.error(logged, error);
  res.status(500).json({ message: `Server error while ${doing}`, error: getErrorMessage(error) });
};

/** The request's workflow id when it can name a stored workflow; otherwise 400 and null. */
const storedWorkflowId = (id: string | undefined, res: Response): string | null => {
  if (id && mongoose.Types.ObjectId.isValid(id)) return id;
  res.status(400).json({ message: "Invalid workflow ID format" });
  return null;
};

/** 403 for a built-in workflow, which can't be changed (`what` it can't be). */
const refuseBuiltin = (id: string | undefined, res: Response, what: string): boolean => {
  if (!id || !isBuiltinWorkflowId(id)) return false;
  res.status(403).json({
    message: `Built-in workflows ${what}. Duplicate the workflow to create an editable copy.`,
  });
  return true;
};

export const saveWorkflow = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(createWorkflowSchema, req, res);
  if (!body) return;
  try {
    const savedWorkflow = await new WorkflowModel(body).save();
    res.status(201).json(toWorkflowDescriptor(savedWorkflow));
  } catch (error: unknown) {
    serverError(res, "saving workflow", error, "Error saving workflow:");
  }
};

export const getWorkflowById = async (req: Request, res: Response): Promise<void> => {
  try {
    const builtinWorkflow = req.params.id ? getBuiltinWorkflowById(req.params.id) : null;
    if (builtinWorkflow) {
      res.status(200).json(builtinWorkflow);
      return;
    }
    const workflowId = storedWorkflowId(req.params.id, res);
    if (!workflowId) return;
    const workflow: IWorkflow | null = await WorkflowModel.findById(workflowId);
    if (!workflow) {
      res.status(404).json({ message: "Workflow not found" });
      return;
    }
    res.status(200).json(toWorkflowDescriptor(workflow));
  } catch (error: unknown) {
    serverError(res, "fetching workflow", error, `Error fetching workflow by ID ${req.params.id}:`);
  }
};

export const getAllWorkflows = async (_req: Request, res: Response): Promise<void> => {
  try {
    const workflows: IWorkflow[] = await WorkflowModel.find({});
    res.status(200).json([...listBuiltinWorkflows(), ...workflows.map((workflow) => toWorkflowDescriptor(workflow))]);
  } catch (error: unknown) {
    serverError(res, "fetching all workflows", error, "Error fetching all workflows:");
  }
};

export const updateWorkflow = async (req: Request, res: Response): Promise<void> => {
  const body = parseBody(updateWorkflowSchema, req, res);
  if (!body) return;
  try {
    if (refuseBuiltin(req.params.id, res, "are read-only")) return;
    const workflowId = storedWorkflowId(req.params.id, res);
    if (!workflowId) return;
    const { name, description, nodes, edges, executionSettings, baseRevision } = body;

    // Partial update: provided nodes/edges replace the stored ones. The schema
    // guarantees at least one field is present.
    const updateData: Partial<IWorkflow> = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (nodes !== undefined) updateData.nodes = nodes;
    if (edges !== undefined) updateData.edges = edges;
    if (executionSettings !== undefined) updateData.executionSettings = executionSettings;

    // Saved from an older revision: something else saved it meanwhile
    // (another tab, a custom node update). Don't overwrite that.
    const updatedWorkflow: IWorkflow | null = await WorkflowModel.findOneAndUpdate(
      baseRevision === undefined ? { _id: workflowId } : atRevision(workflowId, baseRevision),
      withNextRevision(updateData),
      { returnDocument: "after", runValidators: true }
    );

    if (!updatedWorkflow) {
      const stored: IWorkflow | null = await WorkflowModel.findById(workflowId);
      if (!stored) {
        res.status(404).json({ message: "Workflow not found for update" });
        return;
      }
      res.status(409).json({
        message:
          "This workflow was changed elsewhere (in another tab or by a custom node update) since it was opened.",
        revision: revisionOf(stored),
      });
      return;
    }
    res.status(200).json(toWorkflowDescriptor(updatedWorkflow));
  } catch (error: unknown) {
    serverError(res, "updating workflow", error, `Error updating workflow ${req.params.id}:`);
  }
};

export const deleteWorkflow = async (req: Request, res: Response): Promise<void> => {
  try {
    if (refuseBuiltin(req.params.id, res, "cannot be deleted")) return;
    const workflowId = storedWorkflowId(req.params.id, res);
    if (!workflowId) return;
    const deletedWorkflow: IWorkflow | null = await WorkflowModel.findByIdAndDelete(workflowId);
    if (!deletedWorkflow) {
      res.status(404).json({ message: "Workflow not found for deletion" });
      return;
    }
    res.status(200).json({ message: "Workflow deleted successfully" });
  } catch (error: unknown) {
    serverError(res, "deleting workflow", error, `Error deleting workflow ${req.params.id}:`);
  }
};

/** A new, editable workflow with the same content (a built-in one counts as imported). */
const copyOf = (
  source: Pick<IWorkflow, "name" | "description" | "nodes" | "edges" | "executionSettings" | "rawSource" | "importWarnings">,
  origin: { originType: "imported" | "database"; sourceFormat: string; sourceKey: string }
) =>
  new WorkflowModel({
    name: `${source.name ?? "Untitled Workflow"} Copy`,
    description: source.description ?? "",
    nodes: source.nodes ?? [],
    edges: source.edges ?? [],
    executionSettings: source.executionSettings,
    ...origin,
    rawSource: source.rawSource ?? null,
    importWarnings: source.importWarnings ?? [],
    isBuiltin: false,
    isReadOnly: false,
  });

export const duplicateWorkflow = async (req: Request, res: Response): Promise<void> => {
  try {
    const builtinWorkflow = req.params.id ? getBuiltinWorkflowById(req.params.id) : null;
    let copy: InstanceType<typeof WorkflowModel>;
    if (builtinWorkflow) {
      copy = copyOf(builtinWorkflow as unknown as IWorkflow, {
        originType: "imported",
        sourceFormat: builtinWorkflow.origin.sourceFormat,
        sourceKey: builtinWorkflow.origin.sourceKey ?? builtinWorkflow._id,
      });
    } else {
      const workflowId = storedWorkflowId(req.params.id, res);
      if (!workflowId) return;
      const workflow: IWorkflow | null = await WorkflowModel.findById(workflowId);
      if (!workflow) {
        res.status(404).json({ message: "Workflow not found" });
        return;
      }
      copy = copyOf(workflow, {
        originType: "database",
        sourceFormat: workflow.sourceFormat ?? "visual",
        sourceKey: workflow.sourceKey ?? String(workflow._id),
      });
    }
    res.status(201).json(toWorkflowDescriptor(await copy.save()));
  } catch (error: unknown) {
    serverError(res, "duplicating workflow", error, `Error duplicating workflow ${req.params.id}:`);
  }
};
