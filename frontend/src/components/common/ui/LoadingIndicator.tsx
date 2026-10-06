import type React from "react";
import { Loader } from "lucide-react";

interface LoadingIndicatorProps {
  fullPage?: boolean;
  label?: string;
}

const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  fullPage,
  label = "Loading...",
}) => (
  <div
    role="status"
    aria-live="polite"
    className={
      fullPage
        ? "flex h-screen w-screen items-center justify-center gap-2 bg-background text-xl text-nextflow-green"
        : "flex items-center justify-center gap-2 p-4 text-lg text-text"
    }
  >
    <Loader className="animate-spin" aria-hidden />
    <span>{label}</span>
  </div>
);

export default LoadingIndicator;
