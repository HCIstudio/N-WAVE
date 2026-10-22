import type React from "react";
import { useRef, useEffect, useState, type ChangeEvent } from "react";
import type { Node, NodeProps } from "@xyflow/react";
import { useWorkflowContext } from "../../../context/WorkflowContext";
import BaseNode, { type FileObject, type NodeData } from "../BaseNode";
import { detectFileType } from "../../common";
import clsx from "clsx";
import { readUploadedFile, UploadRefusedError } from "../../../utils/fileContent";
import { isFileContentMissing } from "../../../utils/inputFiles";


const FileInputNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  const { id, data } = props;
  const { updateNodeData } = useWorkflowContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Check if files are missing content (reupload needed)
  const filesWithoutContent = (data.files || []).filter(isFileContentMissing);
  const hasFilesWithoutContent = filesWithoutContent.length > 0;

  // The output connects before a file is uploaded: building the workflow
  // comes first, and a run asks for the file (see handleRunWorkflow).
  // Older workflows saved it as not connectable.
  useEffect(() => {
    if (data.outputs?.[0]?.isConnectable !== true) {
      updateNodeData(id, {
        ...data,
        outputs: [{ name: "ch_files_out", isConnectable: true }],
      });
    }
  }, [id, data, updateNodeData]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    setUploadError(null);
    if (selectedFiles && selectedFiles.length > 0) {
      const filePromises = Array.from(selectedFiles).map((file) => {
        return readUploadedFile(file).then(
            (read): FileObject => ({
              name: file.name,
              ...read,
              size: file.size,
              fileType: detectFileType(file.name),
            }),
          );
      });

      Promise.all(filePromises)
        .then((newFiles) => {
          // Replace existing files with same name, or add new ones (same logic as FileInputPanel)
          const existingFiles = data.files || [];
          const updatedFiles = [...existingFiles];

          for (const newFile of newFiles) {
            const existingIndex = updatedFiles.findIndex(
              (f) => f.name === newFile.name
            );
            if (existingIndex !== -1) {
              // Replace existing file
              updatedFiles[existingIndex] = newFile;
            } else {
              // Add new file
              updatedFiles.push(newFile);
            }
          }

          updateNodeData(id, {
            ...data,
            files: updatedFiles,
            label: `${updatedFiles.length} file${
              updatedFiles.length > 1 ? "s" : ""
            } selected`,
            subtitle: `Total size: ${(
              updatedFiles.reduce((acc, f) => acc + f.size, 0) / 1024
            ).toFixed(2)} KB`,
            outputs: [{ name: "ch_files_out", isConnectable: true }],
          });
        })
        .catch((error) => {
          console.error("[FileInputNode] Error loading files:", error);
          setUploadError(
            error instanceof UploadRefusedError ? error.message : "The files couldn't be read.",
          );
        });
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const displayData = {
    ...data,
    label: data.label || "Select File(s)",
    icon: "FolderOpen",
    _hasWarning: hasFilesWithoutContent, // Pass warning state to BaseNode
  };

  return (
    <BaseNode {...props} data={displayData}>
      <div className="nodrag nopan p-2 text-center">
        {data.files && data.files.length > 0 ? (
          <button
            type="button"
            onClick={handleButtonClick}
            className="text-xs text-gray-500 hover:text-nextflow-green font-medium"
          >
            Add File(s)
          </button>
        ) : (
          <button
            type="button"
            onClick={handleButtonClick}
            className={clsx(
              "w-full px-4 py-2 text-sm font-medium text-white bg-nextflow-green-dark rounded-md hover:bg-nextflow-green transition-transform duration-150",
              {
                "scale-105 ring-2 ring-red-500":
                  data.isInvalidConnectionAttempt,
              }
            )}
          >
            Upload File(s)
          </button>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          multiple
        />
        {uploadError && (
          <p role="alert" className="mt-1 text-left text-xs text-red-700">
            {uploadError}
          </p>
        )}
      </div>
    </BaseNode>
  );
};

export default FileInputNode;
