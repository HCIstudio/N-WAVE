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

  // Create a key for tracking file changes
  const incomingFilesKey = useMemo(() => {
    const key = incomingFiles
      .map((f) => `${f.name}:${f.size || 0}:${(f.content || "").slice(0, 100)}`)
      .join("|");

    if (process.env.NODE_ENV === "development" && incomingFiles.length > 0) {
      console.log(
        "useFilterOperator - incoming files changed:",
        incomingFiles.length
      );
    }

    return key;
  }, [incomingFiles]);

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
        console.log("File input changed - clearing filter selection");
        setSelectedFiles([]);
      }
    }
  }, [incomingFilesKey, selectedFiles]);

  // React to upstream refresh signals (when files are re-uploaded)
  useEffect(() => {
    if (nodeData._refreshTimestamp) {
      if (process.env.NODE_ENV === "development") {
        console.log("🔄 Filter received refresh signal, re-evaluating files");
      }

      // Force immediate re-computation of filtered files by triggering useProcessOperatorLogic
      console.log(
        "🔄 Forcing filter re-computation with current files:",
        incomingFiles.length
      );
    }
  }, [nodeData._refreshTimestamp, incomingFiles]);

  const filteredFiles = useMemo((): FileObject[] => {
    console.log("🔄 Computing filteredFiles:", {
      incomingFiles: incomingFiles.length,
      selectedFiles: selectedFiles.length,
      selectedFileNames: selectedFiles.map((f) => f.name),
      nodeDataSelectedFiles: nodeData.selectedFilterFiles?.length || 0,
      nodeDataSelectedNames:
        nodeData.selectedFilterFiles?.map((f) => f.name) || [],
      filterText,
      refreshTimestamp: nodeData._refreshTimestamp,
    });

    const filesToProcess =
      selectedFiles.length > 0
        ? incomingFiles.filter((file) =>
            selectedFiles.some((sf) => sf.name === file.name)
          )
        : incomingFiles;

    if (!filterText) {
      console.log(
        "🔄 No filter text, returning all files:",
        filesToProcess.length
      );
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

    console.log("🔄 Filter processing complete:", {
      input: filesToProcess.length,
      output: result.length,
      filesWithContent: result.filter((f) => f.content).length,
    });

    return result;
  }, [
    incomingFiles,
    selectedFiles,
    filterText,
    filterMode,
    filterNegate,
    nodeData._refreshTimestamp,
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
