import type React from "react";

interface CsvViewerProps {
  content: string;
}

const CsvViewer: React.FC<CsvViewerProps> = ({ content }) => {
  return (
    <pre className="text-sm text-gray-200 whitespace-pre bg-transparent p-4 h-full w-full overflow-auto">
      {content}
    </pre>
  );
};

export default CsvViewer;
