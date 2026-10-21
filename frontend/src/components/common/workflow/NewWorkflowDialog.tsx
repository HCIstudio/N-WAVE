import type React from "react";
import { useId } from "react";
import { Loader } from "lucide-react";
import Modal from "../dialogs/Modal";
import WorkflowPreview from "./WorkflowPreview";
import type { WorkflowDescriptor } from "../../../types/backend";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "../../../templates/workflowTemplates";

/** What a new workflow starts from: a template, or a copy of a built-in demo. */
export type NewWorkflowChoice =
  | { kind: "template"; template: WorkflowTemplate }
  | { kind: "copy"; workflow: WorkflowDescriptor };

const choiceKey = (choice: NewWorkflowChoice): string =>
  choice.kind === "template" ? `template:${choice.template.id}` : `copy:${choice.workflow._id}`;

interface NewWorkflowDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The built-in demos, offered as editable copies. */
  demos: WorkflowDescriptor[];
  onChoose: (choice: NewWorkflowChoice) => void;
  /** The choice being created, while it waits on the backend. */
  pendingKey: string | null;
}

const NewWorkflowDialog: React.FC<NewWorkflowDialogProps> = ({ isOpen, onClose, demos, onChoose, pendingKey }) => {
  const idPrefix = useId();
  const choices: Array<{ choice: NewWorkflowChoice; name: string; description: string; detail?: string }> = [
    ...WORKFLOW_TEMPLATES.map((template) => ({
      choice: { kind: "template", template } as NewWorkflowChoice,
      name: template.name,
      description: template.description,
    })),
    ...demos.map((workflow) => ({
      choice: { kind: "copy", workflow } as NewWorkflowChoice,
      name: workflow.name,
      description: workflow.description ?? "",
      detail: "Editable copy of a built-in demo",
    })),
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Start a new workflow" wide>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {choices.map(({ choice, name, description, detail }) => {
          const key = choiceKey(choice);
          const nodes = choice.kind === "template" ? choice.template.nodes : (choice.workflow.nodes ?? []);
          const edges = choice.kind === "template" ? choice.template.edges : (choice.workflow.edges ?? []);
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onChoose(choice)}
                disabled={pendingKey !== null}
                aria-labelledby={`${idPrefix}${key}-name`}
                aria-describedby={`${detail ? `${idPrefix}${key}-detail ` : ""}${idPrefix}${key}-description`}
                className="flex h-full w-full flex-col rounded-lg border border-panel-border bg-accent p-3 text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-nextflow-green disabled:cursor-wait disabled:opacity-70"
              >
                <WorkflowPreview nodes={nodes} edges={edges} />
                <span id={`${idPrefix}${key}-name`} className="mt-2 flex items-center gap-2 font-semibold text-nextflow-green">
                  {pendingKey === key && <Loader size={14} className="animate-spin" aria-hidden />}
                  {name}
                </span>
                {detail && (
                  <span id={`${idPrefix}${key}-detail`} className="text-xs text-text-light">
                    {detail}
                  </span>
                )}
                <span id={`${idPrefix}${key}-description`} className="mt-1 line-clamp-4 text-xs text-text-light">
                  {description}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
};

export default NewWorkflowDialog;
