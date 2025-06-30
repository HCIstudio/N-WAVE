import type React from "react";
import {
  useState,
  useCallback,
  useContext,
  useMemo,
  useEffect,
} from "react";
import type { Node } from "reactflow";
import { File, X, UploadCloud, Trash2, Plus } from "lucide-react";
import { useDropzone } from "react-dropzone";
import type { NodeData } from "../../nodes/BaseNode";
import { WorkflowContext } from "../../../context/WorkflowContext";
import { SearchInput, detectFileType } from "../../common";
import api from "../../../api";

interface FileObject {
  name: string;
  content: string;
  size: number;
  fileType?: string; // Detected file type
  _id?: string; // Backend metadata ID (optional)
}

const FileInputPanel: React.FC<{
  node: Node<NodeData>;
  onSave: (nodeId: string, data: Partial<NodeData>) => void;
}> = ({ node }) => {
  const { updateNodeData } = useContext(WorkflowContext)!;
  const nodeFiles: FileObject[] = node.data.files || [];

  // Check if any files are missing content (loaded from saved workflow)
  const filesWithoutContent = nodeFiles.filter(
    (file) => !file.content || file.content.trim() === ""
  );
  const hasFilesWithoutContent = filesWithoutContent.length > 0;

  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedForRemoval, setSelectedForRemoval] = useState<Set<string>>(
    new Set()
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Clear selection when files change (handles replacement case)
  useEffect(() => {
    setSelectedForRemoval((prev) => {
      const currentFileNames = new Set(nodeFiles.map((f) => f.name));
      const newSelection = new Set<string>();
      prev.forEach((fileName) => {
        if (currentFileNames.has(fileName)) {
          newSelection.add(fileName);
        }
      });
      return newSelection;
    });
  }, [nodeFiles]);

  // Filter files based on search query
  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return nodeFiles;
    const query = searchQuery.toLowerCase();
    return nodeFiles.filter(
      (file) =>
        file.name.toLowerCase().includes(query) ||
        file.fileType?.toLowerCase().includes(query)
    );
  }, [nodeFiles, searchQuery]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError(null);
      setSuccessMessage(null);
      setIsUploading(true);

      try {
        // Process files locally (browser storage)
        const filePromises = acceptedFiles.map((file) => {
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

        const newFiles = await Promise.all(filePromises);

        // Track replaced vs new files for user feedback
        const replacedFiles: string[] = [];
        const addedFiles: string[] = [];

        // Replace existing files with same name, or add new ones
        const updatedFiles = [...nodeFiles];
        newFiles.forEach((newFile) => {
          const existingIndex = updatedFiles.findIndex(
            (f) => f.name === newFile.name
          );
          if (existingIndex !== -1) {
            // Completely replace existing file (new file has content, so no missing content issue)
            updatedFiles[existingIndex] = {
              ...newFile,
              _id: updatedFiles[existingIndex]._id || newFile._id, // Keep backend ID if exists
            };
            replacedFiles.push(newFile.name);
          } else {
            // Add new file
            updatedFiles.push(newFile);
            addedFiles.push(newFile.name);
          }
        });

        // Show success message
        if (replacedFiles.length > 0 || addedFiles.length > 0) {
          let message = "";
          if (replacedFiles.length > 0) {
            message += `Replaced ${replacedFiles.length} file${
              replacedFiles.length > 1 ? "s" : ""
            }: ${replacedFiles.join(", ")}`;
          }
          if (addedFiles.length > 0) {
            if (message) message += " and ";
            message += `added ${addedFiles.length} new file${
              addedFiles.length > 1 ? "s" : ""
            }: ${addedFiles.join(", ")}`;
          }
          setSuccessMessage(message);
          setTimeout(() => setSuccessMessage(null), 5000);
        }

        // Update node data with new files (content stays in browser)
        updateNodeData(node.id, {
          files: updatedFiles,
          label: `${updatedFiles.length} file${
            updatedFiles.length > 1 ? "s" : ""
          } selected`,
          subtitle: `Total size: ${(
            updatedFiles.reduce((acc, f) => acc + f.size, 0) / 1024
          ).toFixed(2)} KB`,
          outputs: [{ name: "ch_files_out", isConnectable: true }],
        });

        // Optionally register metadata with backend (for persistence across sessions)
        // This is optional and can be skipped for pure browser-based usage
        try {
          for (const file of newFiles) {
            const formData = new FormData();
            const originalFile = acceptedFiles.find(
              (f) => f.name === file.name
            );
            if (originalFile) {
              formData.append("file", originalFile);
              const response = await api.post("/files/register", formData);
              // Store the backend ID for future reference (optional)
              file._id = response.data._id;
            }
          }
        } catch (backendError) {
          console.warn("Could not register files with backend:", backendError);
          // This is fine - files still work locally
        }
      } catch (err) {
        setError("An error occurred during file processing.");
        console.error(err);
      } finally {
        setIsUploading(false);
      }
    },
    [node.id, nodeFiles, updateNodeData]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: true,
  });

  const handleRemoveFile = async (fileName: string) => {
    // Find the file to remove (for backend deletion)
    const fileToRemove = nodeFiles.find((f) => f.name === fileName);

    const newFiles = nodeFiles.filter((f) => f.name !== fileName);
    updateNodeData(node.id, {
      files: newFiles,
      label:
        newFiles.length > 0
          ? `${newFiles.length} file${newFiles.length > 1 ? "s" : ""} selected`
          : "Select File(s)",
      subtitle:
        newFiles.length > 0
          ? `Total size: ${(
              newFiles.reduce((acc, f) => acc + f.size, 0) / 1024
            ).toFixed(2)} KB`
          : undefined,
      outputs: [{ name: "ch_files_out", isConnectable: newFiles.length > 0 }],
    });

    // Clear from selection if it was selected
    setSelectedForRemoval((prev) => {
      const newSet = new Set(prev);
      newSet.delete(fileName);
      return newSet;
    });
  };

  const handleBulkRemove = async () => {
    setIsRemoving(true);

    try {
      // Find files to remove (for backend deletion)
      const filesToRemove = nodeFiles.filter((f) =>
        selectedForRemoval.has(f.name)
      );

      const newFiles = nodeFiles.filter((f) => !selectedForRemoval.has(f.name));
      updateNodeData(node.id, {
        files: newFiles,
        label:
          newFiles.length > 0
            ? `${newFiles.length} file${
                newFiles.length > 1 ? "s" : ""
              } selected`
            : "Select File(s)",
        subtitle:
          newFiles.length > 0
            ? `Total size: ${(
                newFiles.reduce((acc, f) => acc + f.size, 0) / 1024
              ).toFixed(2)} KB`
            : undefined,
        outputs: [{ name: "ch_files_out", isConnectable: newFiles.length > 0 }],
      });
      setSelectedForRemoval(new Set());

      // Delete from backend (for files that have backend IDs)
      const filesToDeleteFromBackend = filesToRemove.filter((f) => f._id);
      if (filesToDeleteFromBackend.length > 0) {
        try {
          await Promise.all(
            filesToDeleteFromBackend.map((file) =>
              api.delete(`/files/${file._id}`)
            )
          );
          console.log(
            `Deleted ${filesToDeleteFromBackend.length} file metadata records from backend`
          );
        } catch (error) {
          console.warn(
            "Could not delete some file metadata from backend:",
            error
          );
          // This is non-critical - the files are still removed from the UI
        }
      }
    } finally {
      setIsRemoving(false);
    }
  };

  const toggleFileSelection = (fileName: string) => {
    const newSelection = new Set(selectedForRemoval);
    if (newSelection.has(fileName)) {
      newSelection.delete(fileName);
    } else {
      newSelection.add(fileName);
    }
    setSelectedForRemoval(newSelection);
  };

  const selectAllFiles = () => {
    const allFileNames = new Set(filteredFiles.map((f) => f.name));
    setSelectedForRemoval(allFileNames);
  };

  const selectFilesWithoutContent = () => {
    const filesWithoutContentNames = new Set(
      filteredFiles
        .filter((f) => !f.content || f.content.trim() === "")
        .map((f) => f.name)
    );
    setSelectedForRemoval(filesWithoutContentNames);
  };

  const clearSelection = () => {
    setSelectedForRemoval(new Set());
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(event.target.value);
  };

  const clearSearch = () => {
    setSearchQuery("");
  };

  // Count selected files from filtered results
  const selectedFromFiltered = Array.from(selectedForRemoval).filter(
    (fileName) => filteredFiles.some((file) => file.name === fileName)
  ).length;

  return (
    <div className="space-y-4">
      {/* --- SELECTED FILES SECTION --- */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-text">
            Workflow Input Files ({nodeFiles.length})
          </h3>
          {nodeFiles.length > 0 && (
            <div className="flex items-center gap-2">
              {selectedFromFiltered > 0 && (
                <>
                  <button
                    onClick={clearSelection}
                    className="text-xs text-text-light hover:text-text"
                  >
                    Clear ({selectedFromFiltered})
                  </button>
                  <button
                    onClick={handleBulkRemove}
                    disabled={isRemoving}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 size={12} />
                    {isRemoving ? "Removing..." : "Remove Selected"}
                  </button>
                </>
              )}
              {selectedFromFiltered === 0 && filteredFiles.length > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllFiles}
                    className="text-xs text-text-light hover:text-text"
                  >
                    Select All
                  </button>
                  {filesWithoutContent.length > 0 && (
                    <button
                      onClick={selectFilesWithoutContent}
                      className="text-xs text-yellow-600 hover:text-yellow-700 border border-yellow-300 rounded px-2 py-1"
                    >
                      Select Missing ({filesWithoutContent.length})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Warning for files without content */}
        {hasFilesWithoutContent && (
          <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg dark:bg-yellow-900/20 dark:border-yellow-800">
            <p className="text-yellow-700 text-sm dark:text-yellow-400">
              <strong>Files need to be re-uploaded:</strong>{" "}
              {filesWithoutContent.length} file
              {filesWithoutContent.length > 1 ? "s" : ""} from this saved
              workflow {filesWithoutContent.length > 1 ? "are" : "is"} missing
              content and need to be uploaded again to work properly.
            </p>
            {filesWithoutContent.length <= 5 && (
              <p className="text-yellow-600 text-xs mt-1 dark:text-yellow-500">
                Missing: {filesWithoutContent.map((f) => f.name).join(", ")}
              </p>
            )}
            <p className="text-yellow-600 text-xs mt-1 dark:text-yellow-500">
              Upload files with the same names to replace them and remove this
              warning.
            </p>
          </div>
        )}

        {/* Search Input */}
        {nodeFiles.length > 0 && (
          <div className="mb-3">
            <SearchInput
              value={searchQuery}
              onChange={handleSearchChange}
              onIconClick={searchQuery ? clearSearch : undefined}
              placeholder="Search files..."
              containerClassName="w-full"
            />
            {searchQuery && (
              <p className="text-xs text-text-light mt-1">
                Showing {filteredFiles.length} of {nodeFiles.length} files
              </p>
            )}
          </div>
        )}

        <div
          {...getRootProps()}
          className={`bg-background-light rounded-lg border-2 border-dashed transition-colors duration-200 ${
            isDragActive
              ? "border-nextflow-green bg-nextflow-green/10"
              : "border-transparent hover:border-accent"
          }`}
        >
          {filteredFiles.length > 0 ? (
            <div className="p-3 max-h-64 overflow-y-auto space-y-2">
              {filteredFiles.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className={`flex items-center justify-between bg-background p-3 rounded-md border transition-colors cursor-pointer ${
                    selectedForRemoval.has(file.name)
                      ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800"
                      : !file.content
                      ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800"
                      : "border-accent hover:border-nextflow-green/50 hover:bg-background-light"
                  }`}
                  onClick={() => toggleFileSelection(file.name)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedForRemoval.has(file.name)}
                      onChange={() => toggleFileSelection(file.name)}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-accent flex-shrink-0"
                    />
                    <File
                      size={16}
                      className="text-nextflow-green flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm text-text font-medium overflow-x-auto scrollbar-hidden"
                        style={{
                          whiteSpace: "nowrap",
                        }}
                        title={file.name}
                      >
                        {file.name}
                      </div>
                      <div className="text-xs text-text-light flex items-center gap-2">
                        <span>{formatFileSize(file.size)}</span>
                        {file.fileType && (
                          <>
                            <span>•</span>
                            <span className="px-1.5 py-0.5 bg-nextflow-green/10 text-nextflow-green rounded text-xs font-medium uppercase">
                              {file.fileType}
                            </span>
                          </>
                        )}
                        {!file.content && (
                          <>
                            <span>•</span>
                            <span className="px-1.5 py-0.5 bg-yellow-200/60 text-yellow-700 rounded text-xs font-medium">
                              NEEDS UPLOAD
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      await handleRemoveFile(file.name);
                    }}
                    className="p-1 text-red-500 hover:text-red-400 transition-colors flex-shrink-0 ml-2"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-text-light p-6 min-h-[120px] flex items-center justify-center">
              {nodeFiles.length === 0 ? (
                // No files at all
                isDragActive ? (
                  <div className="flex flex-col items-center gap-3">
                    <UploadCloud size={24} className="text-nextflow-green" />
                    <p className="text-nextflow-green font-medium">
                      Drop files here to add them
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <File size={24} className="text-text-light" />
                    <p>No files have been added.</p>
                    <p className="text-xs">
                      Drag files here or use the button below.
                    </p>
                  </div>
                )
              ) : (
                // Files exist but none match search
                <div className="flex flex-col items-center gap-3">
                  <File size={24} className="text-text-light" />
                  <p>No files match your search.</p>
                  <button
                    onClick={clearSearch}
                    className="text-xs text-nextflow-green hover:underline"
                  >
                    Clear search to see all files
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* --- UPLOAD SECTION --- */}
      <div className="space-y-3">
        <button
          onClick={open}
          disabled={isUploading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-nextflow-green text-white rounded-lg hover:bg-nextflow-green/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          <Plus size={18} />
          {isUploading ? "Processing Files..." : "Add Files"}
        </button>

        <div className="text-center">
          <p className="text-xs text-text-light">
            Or drag and drop files anywhere in the area above
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/20 dark:border-red-800">
            <p className="text-red-600 text-sm dark:text-red-400">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg dark:bg-green-900/20 dark:border-green-800">
            <p className="text-green-600 text-sm dark:text-green-400">
              {successMessage}
            </p>
          </div>
        )}
      </div>

      <input {...getInputProps()} />
    </div>
  );
};

export default FileInputPanel;
