import { useEffect } from "react";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";

export const useProcessOperatorLogic = (
  processedFiles: FileObject[],
  operatorType: string,
  onSave: (data: Partial<NodeData>) => void,
  incomingFiles?: FileObject[],
  selectedFiles?: FileObject[]
) => {
  useEffect(() => {
    // Check if incoming files are missing content (should show reupload message)
    if (incomingFiles && incomingFiles.length > 0) {
      const filesWithoutContent = incomingFiles.filter(
        (file) => !file.content || file.content.trim() === ""
      );

      if (filesWithoutContent.length > 0) {
        // Don't override subtitle when files need reupload - let OperatorNode handle it
        onSave({ files: processedFiles });
        return;
      }
    }

    // Check if files were actually edited/modified
    let filesWereEdited = false;
    let baselineFiles = incomingFiles; // Default comparison base

    // For filter operations with file selection, compare against selected files
    if (
      operatorType === "filter" &&
      selectedFiles &&
      selectedFiles.length > 0
    ) {
      baselineFiles = selectedFiles;

      // If files are selected but not text-filtered, consider them "edited" (filtered by selection)
      if (selectedFiles.length < (incomingFiles?.length || 0)) {
        filesWereEdited = true; // File selection is a form of filtering
      }
    }

    if (
      baselineFiles &&
      baselineFiles.length > 0 &&
      processedFiles.length > 0 &&
      !filesWereEdited // Only check content if not already marked as edited
    ) {
      // Compare content by matching file names
      filesWereEdited = processedFiles.some((processedFile) => {
        const matchingBaselineFile = baselineFiles.find(
          (baselineFile) => baselineFile.name === processedFile.name
        );

        if (!matchingBaselineFile) return true; // New file created = edited

        // For files with content, check if content changed
        if (matchingBaselineFile.content && processedFile.content) {
          return matchingBaselineFile.content !== processedFile.content;
        }

        // For files that originally had no content, consider them edited if they now have content
        if (
          !matchingBaselineFile.content &&
          processedFile.content &&
          processedFile.content.length > 0
        ) {
          return true;
        }

        return false;
      });
    }

    let subtitle: string;
    const count = processedFiles.length;

    if (operatorType === "merge") {
      subtitle = count > 0 ? `Merged to 1 file` : `Merged (0 files)`;
    } else {
      let pastTense: string;
      switch (operatorType) {
        case "filter":
          pastTense = "Filtered";
          break;
        case "map":
          pastTense = "Mapped";
          break;
        default:
          pastTense =
            operatorType.charAt(0).toUpperCase() + operatorType.slice(2) + "ed";
      }

      // For filter operations, don't show "(unedited)" if files were selected
      // Selection itself is a form of filtering
      const editedIndicator = filesWereEdited ? "" : " (unedited)";
      subtitle = `${pastTense} ${count} file${
        count !== 1 ? "s" : ""
      }${editedIndicator}`;
    }

    console.log(`📊 ${operatorType} operator saving:`, {
      fileCount: count,
      subtitle,
      filesWithContent: processedFiles.filter((f) => f.content).length,
      selectedFiles: selectedFiles?.length || 0,
      filesWereEdited,
    });

    onSave({ files: processedFiles, subtitle });
  }, [processedFiles, operatorType, onSave, incomingFiles, selectedFiles]);
};
