import type React from "react";

interface LoadingIndicatorProps {
  fullPage?: boolean;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({ fullPage }) => {
  if (fullPage) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="text-2xl font-semibold text-text">
          Loading Workflow...
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center p-4">
      <div className="text-lg text-text">Loading...</div>
    </div>
  );
};

export default LoadingIndicator;
