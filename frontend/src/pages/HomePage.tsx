import type React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Pencil, Trash2, Save } from "lucide-react";
import api from "../api";
import {
  ConfirmDialog,
  ActionDialog,
  type ActionButtonProps,
} from "../components/common";
import PageLayout from "../components/layout/PageLayout";
import { Loader } from "lucide-react";

interface Workflow {
  _id: string;
  name: string;
  description: string;
}

const HomePage: React.FC = () => {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<{
    name: string;
    description: string;
  }>({
    name: "",
    description: "",
  });
  const [originalEditData, setOriginalEditData] = useState<{
    name: string;
    description: string;
  } | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isUnsavedChangesModalOpen, setIsUnsavedChangesModalOpen] =
    useState(false);
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);
  const nameTextareaRef = useRef<HTMLTextAreaElement>(null);
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editingCardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const fetchWorkflows = async () => {
    try {
      setLoading(true);
      const response = await api.get("/workflows");
      setWorkflows(response.data);
      setError(null);
    } catch (err) {
      setError("Failed to fetch workflows.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkflows();
  }, []);

  useEffect(() => {
    const resizeTextarea = (ref: React.RefObject<HTMLTextAreaElement>) => {
      if (ref.current) {
        ref.current.style.height = "auto";
        ref.current.style.height = `${ref.current.scrollHeight}px`;
      }
    };
    if (editingId) {
      resizeTextarea(nameTextareaRef);
      resizeTextarea(descriptionTextareaRef);
    }
  }, [editingId, editData]);

  const handleEditClick = (e: React.MouseEvent, wf: Workflow) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingId(wf._id);
    const data = { name: wf.name || "", description: wf.description || "" };
    setEditData(data);
    setOriginalEditData(data);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLTextAreaElement>,
    field: "name" | "description"
  ) => {
    setEditData((prev) => ({ ...prev, [field]: e.target.value }));
  };

  const handleSave = async (id: string) => {
    try {
      await api.put(`/workflows/${id}`, editData);
      setWorkflows((prev) =>
        prev.map((wf) => (wf._id === id ? { ...wf, ...editData } : wf))
      );
      setEditingId(null);
      setOriginalEditData(null);
    } catch (err) {
      setError("Failed to update workflow.");
      console.error(err);
    }
  };

  const handleCancelEdit = useCallback(() => {
    setEditingId(null);
    setOriginalEditData(null);
  }, []);

  const checkForUnsavedChanges = useCallback(() => {
    if (!originalEditData) return false;
    return (
      originalEditData.name !== editData.name ||
      originalEditData.description !== editData.description
    );
  }, [originalEditData, editData]);

  const attemptCloseEditor = useCallback(() => {
    if (checkForUnsavedChanges()) {
      setIsUnsavedChangesModalOpen(true);
    } else {
      handleCancelEdit();
    }
  }, [checkForUnsavedChanges, handleCancelEdit]);

  useEffect(() => {
    if (!editingId) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        editingCardRef.current &&
        !editingCardRef.current.contains(event.target as Node)
      ) {
        attemptCloseEditor();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [editingId, attemptCloseEditor]);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setWorkflowToDelete(id);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!workflowToDelete) return;
    try {
      await api.delete(`/workflows/${workflowToDelete}`);
      setWorkflows((prev) => prev.filter((wf) => wf._id !== workflowToDelete));
    } catch (err) {
      setError("Failed to delete workflow.");
      console.error(err);
    } finally {
      setIsDeleteModalOpen(false);
      setWorkflowToDelete(null);
    }
  };

  const handleNewWorkflow = async () => {
    try {
      // Default execution settings for new workflows
      const defaultExecutionSettings = {
        mode: "docker",
        nextflow: {
          version: "25.04.4",
          forceVersion: false,
          enableDsl2: true,
          enableTrace: false,
          enableTimeline: false,
          enableReport: false,
        },
        output: {
          directory: "results",
          namingPattern: "{workflow_name}_{timestamp}",
          overwrite: false,
          keepWorkDir: false,
        },
        container: {
          enabled: true,
          defaultImage: "ubuntu:22.04",
          registry: "docker.io",
          pullPolicy: "if-not-present",
          customRunOptions: [],
        },
        resources: {
          maxCpus: 4,
          maxMemory: "4.GB",
          maxTime: "PT30M",
          executor: "local",
        },
        errorHandling: {
          strategy: "terminate",
          maxRetries: 0,
          backoffStrategy: "exponential",
          continueOnError: false,
        },
        environment: {
          profile: "standard",
          customParams: {},
          environmentVariables: {},
        },
        cleanup: {
          onSuccess: false,
          onFailure: false,
          intermediateFiles: false,
          workDirectory: false,
        },
        validation: {
          requireContainer: false,
          allowMissingInputs: false,
          strictChannelTypes: false,
          enableTypeChecking: false,
        },
      };

      const response = await api.post("/workflows", {
        name: "Untitled Workflow",
        nodes: [],
        edges: [],
        description: "",
        executionSettings: defaultExecutionSettings,
      });
      navigate(`/workflow/${response.data._id}`);
    } catch (err) {
      setError("Failed to create new workflow.");
      console.error(err);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (editingId && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave(editingId);
    }
    if (e.key === "Escape") {
      e.preventDefault();
      attemptCloseEditor();
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-text-light text-xl flex items-center gap-2">
            <Loader className="animate-spin text-nextflow-green" />
            <span className="text-nextflow-green">Loading workflows...</span>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout>
        <div className="p-8 text-center text-red-500">{error}</div>
      </PageLayout>
    );
  }

  const unsavedChangesActions: ActionButtonProps[] = [
    {
      text: "Cancel",
      onClick: () => setIsUnsavedChangesModalOpen(false),
      className: "bg-gray-200 hover:bg-gray-300 text-gray-800",
      closeOnClick: true,
    },
    {
      text: "Discard",
      onClick: () => {
        handleCancelEdit();
        setIsUnsavedChangesModalOpen(false);
      },
      className: "bg-red-600 hover:bg-red-700 text-white",
      closeOnClick: true,
    },
    {
      text: "Save Changes",
      onClick: () => {
        if (editingId) handleSave(editingId);
        setIsUnsavedChangesModalOpen(false);
      },
      className: "bg-nextflow-green hover:bg-nextflow-green-dark text-white",
      closeOnClick: true,
    },
  ];

  const renderWorkflowCard = (wf: Workflow) => {
    const isEditing = editingId === wf._id;

    const cardContent = (
      <>
        <div className="absolute top-4 right-2 z-10 flex items-center gap-1">
          {isEditing ? (
            <>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (editingId) handleSave(editingId);
                }}
                className="p-1 text-text-light hover:text-white"
                aria-label="Save"
              >
                <Save size={16} />
              </button>
              <button
                onClick={(e) => handleDeleteClick(e, wf._id)}
                className="p-1 text-text-light hover:text-red-500"
                aria-label="Delete"
              >
                <Trash2 size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={(e) => handleEditClick(e, wf)}
                className="p-1 text-text-light hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Edit"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={(e) => handleDeleteClick(e, wf._id)}
                className="p-1 text-text-light hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Delete"
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
        {isEditing ? (
          <>
            <div className="pr-12">
              <textarea
                ref={nameTextareaRef}
                value={editData.name}
                onChange={(e) => handleInputChange(e, "name")}
                onKeyDown={handleInputKeyDown}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="text-lg font-semibold bg-transparent border border-gray-600 rounded-md text-nextflow-green focus:outline-none focus:border-nextflow-green focus:ring-1 focus:ring-nextflow-green w-full resize-none overflow-hidden p-2"
                rows={1}
                autoFocus
              />
            </div>
            <textarea
              ref={descriptionTextareaRef}
              value={editData.description}
              onChange={(e) => handleInputChange(e, "description")}
              onKeyDown={handleInputKeyDown}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className="text-sm bg-transparent border border-gray-600 rounded-md text-text focus:outline-none focus:border-nextflow-green focus:ring-1 focus:ring-nextflow-green w-full mt-2 resize-none overflow-hidden p-2"
              rows={1}
              placeholder="Add a description..."
            />
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-nextflow-green whitespace-pre-wrap h-[42px] overflow-hidden p-2 pr-12">
              {wf.name}
            </h2>
            <p className="text-sm text-text-light mt-2 whitespace-pre-wrap h-[40px] overflow-hidden p-2">
              {wf.description || (
                <span className="text-gray-500 italic">No description</span>
              )}
            </p>
          </>
        )}
      </>
    );

    if (isEditing) {
      return (
        <div
          ref={editingCardRef}
          key={wf._id}
          className="group relative block bg-accent rounded-lg shadow-sm p-4"
        >
          {cardContent}
        </div>
      );
    }

    return (
      <Link
        key={wf._id}
        to={`/workflow/${wf._id}`}
        className="group relative block bg-accent rounded-lg shadow-sm hover:shadow-md transition-shadow p-4"
      >
        {cardContent}
      </Link>
    );
  };

  return (
    <PageLayout>
      <div className="p-8">
        <h1 className="text-3xl font-bold text-text mb-6">Workflows</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {workflows.map((wf) => renderWorkflowCard(wf))}
          <div
            onClick={handleNewWorkflow}
            className="flex items-center justify-center p-6 bg-transparent border-2 border-dashed border-accent rounded-lg text-nextflow-green hover:bg-accent cursor-pointer transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span className="ml-2">New Workflow</span>
          </div>
        </div>
        <ConfirmDialog
          isOpen={isDeleteModalOpen}
          onClose={() => setIsDeleteModalOpen(false)}
          onConfirm={confirmDelete}
          title="Delete Workflow"
          message="Are you sure you want to delete this workflow? This action cannot be undone."
          confirmText="Delete"
        />
        <ActionDialog
          isOpen={isUnsavedChangesModalOpen}
          onClose={() => setIsUnsavedChangesModalOpen(false)}
          title="Unsaved Changes"
          message="You have unsaved changes. What would you like to do?"
          actions={unsavedChangesActions}
        />
      </div>
    </PageLayout>
  );
};

export default HomePage;
