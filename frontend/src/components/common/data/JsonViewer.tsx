import type React from "react";

interface JsonViewerProps {
  content: string;
}

const JsonViewer: React.FC<JsonViewerProps> = ({ content }) => {
  try {
    const jsonObject = JSON.parse(content);
    const formattedJson = JSON.stringify(jsonObject, null, 2);
    return (
      <pre className="text-sm text-gray-200 whitespace-pre-wrap break-all bg-background-darker p-4 rounded-md flex-grow">
        {formattedJson}
      </pre>
    );
  } catch (error) {
    return (
      <div className="p-4 text-center text-red-400">Invalid JSON format.</div>
    );
  }
};

export default JsonViewer;
