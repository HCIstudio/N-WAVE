import { useMemo, useState, useEffect } from "react";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { useProcessOperatorLogic } from "./useProcessOperatorLogic";

export const useFilterOperator = (
  incomingFiles: FileObject[],
  nodeData: NodeData,
  onSave: (data: Partial<NodeData>) => void
) => {
  // Initialize selectedFiles from nodeData if it exists
  const [selectedFiles, setSelectedFiles] = useState<FileObject[]>(() => {
    return nodeData.selectedFilterFiles || [];
  });

  const {
    filterText = "",
    filterMode = "contains",
    filterNegate = false,
  } = nodeData;

  // Save selectedFiles to nodeData whenever they change
  useEffect(() => {
    onSave({ selectedFilterFiles: selectedFiles });
  }, [selectedFiles, onSave]);

  // Update selectedFiles when nodeData changes (e.g., when loading from backend)
  useEffect(() => {
    if (nodeData.selectedFilterFiles) {
      setSelectedFiles(nodeData.selectedFilterFiles);
    }
  }, [nodeData.selectedFilterFiles]);

  // Reset selectedFiles when incomingFiles change significantly
  useEffect(() => {
    // If selectedFiles references files that no longer exist, clear the selection
    if (selectedFiles.length > 0) {
      const currentFileNames = new Set(incomingFiles.map((f) => f.name));
      const hasInvalidFiles = selectedFiles.some(
        (f) => !currentFileNames.has(f.name)
      );

      if (hasInvalidFiles) {
        setSelectedFiles([]);
      }
    }
  }, [incomingFiles, selectedFiles]);

  const filteredFiles = useMemo((): FileObject[] => {
    const filesToProcess =
      selectedFiles.length > 0
        ? incomingFiles.filter((file) =>
            selectedFiles.some((sf) => sf.name === file.name)
          )
        : incomingFiles;

    if (!filterText) {
      return filesToProcess;
    }

    const result = filesToProcess.map((file) => {
      // Handle files without content - pass them through as empty files
      if (!file.content || typeof file.content !== "string") {
        console.warn(
          `File ${file.name} has no content, passing through as empty file`
        );
        return {
          ...file,
          content: "",
          size: 0,
        };
      }

      const lines = file.content.split("\n");
      const processedContent = lines
        .filter((line) => {
          let isMatch = false;
          try {
            switch (filterMode) {
              case "startsWith":
                isMatch = line.startsWith(filterText);
                break;
              case "endsWith":
                isMatch = line.endsWith(filterText);
                break;
              case "matches":
                isMatch = new RegExp(filterText).test(line);
                break;
              default:
                isMatch = line.includes(filterText);
                break;
            }
          } catch (e) {
            return false;
          }
          return filterNegate ? !isMatch : isMatch;
        })
        .join("\n");

      // Always return the file, even if filtered content is empty
      return {
        ...file,
        content: processedContent,
        size: processedContent.length,
      };
    });

    return result;
  }, [
    incomingFiles,
    selectedFiles,
    filterText,
    filterMode,
    filterNegate,
  ]);

  useProcessOperatorLogic(
    filteredFiles,
    "filter",
    onSave,
    incomingFiles,
    nodeData.selectedFilterFiles || []
  );

  return {
    selectedFiles,
    setSelectedFiles,
  };
};
