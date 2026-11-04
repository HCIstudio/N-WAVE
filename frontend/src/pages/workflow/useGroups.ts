// Grouping steps into a subworkflow (#221) from the canvas: the selected
// steps or a suggestion of the analysis, named in a dialog; renaming and
// ungrouping from a group's frame.

import type { Edge, Node } from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";
import { logActivity } from "../../activity/activityLog";
import type { NodeData } from "../../components/nodes/BaseNode";
import { processNamesFor } from "../../generators/core/naming";
import {
  groupName,
  groupOf,
  groupProblem,
  groupsOf,
  isGroupable,
  renamedGroup,
  withGroup,
  withoutGroup,
} from "../../groups/groups";

export interface GroupDialogState {
  mode: "group" | "rename";
  /** The steps to group, or the group to rename. */
  ids: string[];
  group?: string;
  from: "selection" | "suggestion";
  initialName: string;
}

const labelOf = (node: Node<NodeData>) => String(node.data.label || node.type);

/** A name for new steps' group: what they share ("FastQC raw", "FastQC trimmed" → FASTQC), else GROUP. */
const suggestedName = (nodes: Node<NodeData>[], taken: Set<string>): string => {
  const words = nodes.map((node) => groupName(labelOf(node)).split("_"));
  const shared: string[] = [];
  for (let index = 0; words.every((list) => list[index] && list[index] === words[0][index]); index += 1) shared.push(words[0][index]);
  const base = (nodes.length > 1 && shared.join("_")) || "GROUP";
  let name = base;
  for (let count = 2; taken.has(name); count += 1) name = `${base}_${count}`;
  return name;
};

export const useGroups = ({
  nodes,
  edges,
  setNodes,
  setIsDirty,
  ensureEditable,
}: {
  nodes: Node<NodeData>[];
  edges: Edge[];
  setNodes: (update: (nodes: Node<NodeData>[]) => Node<NodeData>[]) => void;
  setIsDirty: (dirty: boolean) => void;
  ensureEditable: () => Promise<boolean>;
}) => {
  const [dialog, setDialog] = useState<GroupDialogState | null>(null);
  const groups = useMemo(() => groupsOf(nodes), [nodes]);

  /** Names a group can't have: the steps' and the other groups'. */
  const takenNames = useCallback(
    (except?: string) =>
      new Set([...processNamesFor(nodes).values(), ...[...groups.keys()].filter((group) => group !== except)]),
    [nodes, groups],
  );

  /** The selected steps that can be grouped, unless they're one group already. */
  const selection = useMemo(() => {
    const selected = nodes.filter((node) => node.selected && isGroupable(node));
    const sameGroup = selected.length > 0 && selected.every((node) => groupOf(node) && groupOf(node) === groupOf(selected[0]));
    return sameGroup ? [] : selected;
  }, [nodes]);

  const startGrouping = useCallback(
    (ids: string[], from: GroupDialogState["from"]) => {
      const chosen = nodes.filter((node) => ids.includes(node.id));
      setDialog({ mode: "group", ids, from, initialName: suggestedName(chosen, takenNames()) });
    },
    [nodes, takenNames],
  );

  const startRename = useCallback(
    (group: string) => {
      setDialog({ mode: "rename", ids: (groups.get(group) ?? []).map((node) => node.id), group, from: "selection", initialName: group });
    },
    [groups],
  );

  const problemFor = useCallback(
    (name: string): string | null => {
      if (!dialog) return null;
      if (dialog.mode === "rename") return name === dialog.group ? null : groupProblem(nodes, edges, dialog.ids, name, takenNames(dialog.group));
      return groupProblem(nodes, edges, dialog.ids, name, takenNames());
    },
    [dialog, nodes, edges, takenNames],
  );

  const confirm = useCallback(
    async (name: string) => {
      if (!dialog) return;
      // A read-only workflow (a built-in example) offers a copy instead: group there.
      if (!(await ensureEditable())) {
        setDialog(null);
        return;
      }
      if (dialog.mode === "group") {
        setNodes((current) => withGroup(current, dialog.ids, name));
        logActivity("group.created", { steps: dialog.ids.length, from: dialog.from });
      } else if (dialog.group && name !== dialog.group) {
        const from = dialog.group;
        setNodes((current) => renamedGroup(current, from, name));
        logActivity("group.renamed");
      }
      setIsDirty(true);
      setDialog(null);
    },
    [dialog, ensureEditable, setNodes, setIsDirty],
  );

  const ungroup = useCallback(
    async (group: string) => {
      if (!(await ensureEditable())) return;
      logActivity("group.removed", { steps: groups.get(group)?.length ?? 0 });
      setNodes((current) => withoutGroup(current, group));
      setIsDirty(true);
    },
    [ensureEditable, groups, setNodes, setIsDirty],
  );

  return {
    groups,
    selection,
    dialog,
    dialogSteps: dialog ? nodes.filter((node) => dialog.ids.includes(node.id)).map(labelOf) : [],
    startGrouping,
    startRename,
    problemFor,
    confirm,
    ungroup,
    closeDialog: () => setDialog(null),
  };
};
