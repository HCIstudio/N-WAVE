import type React from "react";
import { useRef, useContext, useEffect, type ChangeEvent } from "react";
import type { NodeProps } from "reactflow";
import { WorkflowContext } from "../../../context/WorkflowContext";
import BaseNode, { type NodeData } from "../BaseNode";
import { detectFileType } from "../../common";
import clsx from "clsx";

interface FileObject {
  name: string;
  content: string;
  size: number;
  fileType?: string; // Detected file type
  _id?: string; // Backend metadata ID (optional)
}

const FileInputNode: React.FC<NodeProps<NodeData>> = (props) => {
  const { id, data } = props;
  const { updateNodeData } = useContext(WorkflowContext)!;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isConnectable = !!data.files && data.files.length > 0;

  // Check if files are missing content (reupload needed)
  const filesWithoutContent = (data.files || []).filter(
    (file) => !file.content || file.content.trim() === ""
  );
  const hasFilesWithoutContent = filesWithoutContent.length > 0;

  useEffect(() => {
    // Only update if the connectable status changes, to avoid loops
    if (data.outputs?.[0]?.isConnectable !== isConnectable) {
      updateNodeData(id, {
        ...data,
        outputs: [{ name: "ch_files_out", isConnectable }],
      });
    }
  }, [id, data, isConnectable, updateNodeData]);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      const filePromises = Array.from(selectedFiles).map((file) => {
        return new Promise<FileObject>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const content = e.target?.result as string;
            const fileType = detectFileType(file.name);
            resolve({
              name: file.name,
              content: content,
              size: file.size,
              fileType: fileType,
            });
          };
          reader.onerror = reject;
          reader.readAsText(file);
        });
      });

      Promise.all(filePromises)
        .then((newFiles) => {
          // Replace existing files with same name, or add new ones (same logic as FileInputPanel)
          const existingFiles = data.files || [];
          const updatedFiles = [...existingFiles];

          newFiles.forEach((newFile) => {
            const existingIndex = updatedFiles.findIndex(
              (f) => f.name === newFile.name
            );
            if (existingIndex !== -1) {
              // Replace existing file
              updatedFiles[existingIndex] = {
                ...newFile,
                _id: updatedFiles[existingIndex]._id || newFile._id, // Keep backend ID if exists
              };
            } else {
              // Add new file
              updatedFiles.push(newFile);
            }
          });

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
            onClick={handleButtonClick}
            className="text-xs text-gray-500 hover:text-nextflow-green font-medium"
          >
            Add File(s)
          </button>
        ) : (
          <button
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
      </div>
    </BaseNode>
  );
};

export default FileInputNode;
