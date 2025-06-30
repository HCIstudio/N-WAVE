import { useMemo } from "react";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { useProcessOperatorLogic } from "./useProcessOperatorLogic";

export const useMergeOperator = (
  incomingFiles: FileObject[],
  nodeData: NodeData,
  onSave: (data: Partial<NodeData>) => void
) => {
  const { mergeOperation = "collect", mergeJoinSeparator = "\\n" } = nodeData;

  const mergedFiles = useMemo((): FileObject[] => {
    if (incomingFiles.length === 0) return [];

    // Filter out files without content and safely combine
    const combinedContent = incomingFiles
      .filter((f) => f.content && typeof f.content === "string")
      .map((f) => f.content)
      .join("\n");

    if (!combinedContent) {
      return [
        {
          name: "merge_result.txt",
          content: "",
          size: 0,
        },
      ];
    }

    const lines = combinedContent.split("\n").filter(Boolean);
    let mergedContent: string;

    switch (mergeOperation) {
      case "collect":
        // Simply combine all files
        mergedContent = lines.join("\n");
        break;
      case "count":
        mergedContent = `File count: ${incomingFiles.length}\nLine count: ${lines.length}`;
        break;
      case "join":
        mergedContent = lines.join(mergeJoinSeparator.replace(/\\n/g, "\n"));
        break;
      default:
        mergedContent = "Error: Unknown merge operation";
    }

    return [
      {
        name: "merge_result.txt",
        content: mergedContent,
        size: mergedContent.length,
      },
    ];
  }, [
    incomingFiles,
    mergeOperation,
    mergeJoinSeparator,
    nodeData._refreshTimestamp,
  ]);

  useProcessOperatorLogic(mergedFiles, "merge", onSave, incomingFiles);
};
