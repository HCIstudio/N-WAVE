import type React from "react";
import { useState, useMemo, useEffect } from "react";
import type { Node } from "reactflow";
import { Download } from "lucide-react";
import type { NodeData } from "../../nodes/BaseNode";
import { FileViewer, detectFileType } from "../../common";

interface OutputDisplayPanelContentProps {
  node: Node<NodeData> | null;
  onNodeDataChange?: (nodeId: string, data: Partial<NodeData>) => void;
}

const getContentTypeForFile = (fileName: string): string => {
  return detectFileType(fileName);
};

const OutputDisplayPanelContent: React.FC<OutputDisplayPanelContentProps> = ({
  node,
  onNodeDataChange,
}) => {
  // Initialize from node data or default values
  const [selectedFileName, setSelectedFileName] = useState<string>(
    node?.data?.selectedFileName || "all"
  );
  const [downloadFormat, setDownloadFormat] = useState(
    node?.data?.downloadFormat || "txt"
  );

  const files = node?.data?.files || [];

  useEffect(() => {
    if (selectedFileName === "all") {
      setDownloadFormat("txt");
    }
  }, [selectedFileName]);

  // Save changes to node data when settings change
  useEffect(() => {
    if (node && onNodeDataChange) {
      onNodeDataChange(node.id, {
        selectedFileName,
        downloadFormat,
      });
    }
  }, [selectedFileName, downloadFormat, node, onNodeDataChange]);

  const displayedContent = useMemo(() => {
    if (selectedFileName === "all") {
      return files
        .map((file) => `--- FILE: ${file.name} ---\n\n${file.content}`)
        .join("\n\n");
    }
    const selectedFile = files.find((file) => file.name === selectedFileName);
    return selectedFile?.content || "";
  }, [files, selectedFileName]);

  const contentType = useMemo(() => {
    if (selectedFileName === "all") {
      return "text";
    }
    const selectedFile = files.find((file) => file.name === selectedFileName);
    return selectedFile ? getContentTypeForFile(selectedFile.name) : "text";
  }, [displayedContent, selectedFileName, files]);

  const handleDownload = () => {
    if (!node) return;

    let blob: Blob;
    const fileExtension = downloadFormat;
    const contentToDownload = displayedContent;
    let fileName = `${node.data.label || `output_${node.id}`}`;

    if (selectedFileName !== "all") {
      fileName += `_${selectedFileName}`;
    }
    fileName += `.${fileExtension}`;

    if (downloadFormat === "json") {
      try {
        const jsonContent = JSON.stringify(
          JSON.parse(contentToDownload),
          null,
          2
        );
        blob = new Blob([jsonContent], { type: "application/json" });
      } catch (error) {
        console.warn("Content is not valid JSON. Downloading as text.");
        blob = new Blob([contentToDownload], {
          type: "text/plain;charset=utf-8",
        });
      }
    } else {
      const type =
        downloadFormat === "csv"
          ? "text/csv;charset=utf-8"
          : "text/plain;charset=utf-8";
      blob = new Blob([contentToDownload], { type });
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const renderContent = () => {
    if (!displayedContent) {
      return (
        <div className="p-4 text-center text-text-light">
          No content to display.
        </div>
      );
    }

    const fileName =
      selectedFileName === "all" ? "combined.txt" : selectedFileName;
    return (
      <FileViewer
        content={displayedContent}
        fileName={fileName}
        fileType={contentType}
      />
    );
  };

  if (!node) {
    return null;
  }

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex-shrink-0 grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="file-selector" className="text-sm mb-1 block">
            View File:
          </label>
          <select
            id="file-selector"
            value={selectedFileName}
            onChange={(e) => setSelectedFileName(e.target.value)}
            className="w-full rounded-md border-gray-600 bg-accent text-text p-2 focus:border-nextflow-green focus:ring-nextflow-green"
            disabled={files.length === 0}
          >
            <option value="all">All Files (Concatenated)</option>
            {files.map((file) => (
              <option key={file.name} value={file.name}>
                {file.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label htmlFor="download-format" className="text-sm mb-1 block">
            Download as:
          </label>
          <div className="flex">
            <select
              id="download-format"
              value={downloadFormat}
              onChange={(e) => setDownloadFormat(e.target.value)}
              className="flex-grow rounded-l-md border-gray-600 bg-accent text-text p-2 focus:border-nextflow-green focus:ring-nextflow-green"
            >
              <option value="txt">Text</option>
              <option value="csv" disabled={selectedFileName === "all"}>
                CSV
              </option>
              <option value="json" disabled={selectedFileName === "all"}>
                JSON
              </option>
            </select>
            <button
              onClick={handleDownload}
              className="p-2 text-text bg-accent hover:bg-accent-hover rounded-r-md"
              aria-label="Download Output"
              disabled={!displayedContent}
            >
              <Download size={18} />
            </button>
          </div>
        </div>
      </div>
      <div className="flex-grow overflow-auto bg-background-darker rounded-md">
        {renderContent()}
      </div>
    </div>
  );
};

export default OutputDisplayPanelContent;
