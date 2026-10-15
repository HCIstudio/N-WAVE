import type React from "react";
import { memo } from "react";
import { useReactFlow } from "reactflow";
import { ZoomIn, ZoomOut, Maximize } from "lucide-react";

const CustomControls: React.FC = () => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div
      data-canvas-controls
      className="absolute bottom-4 left-4 flex flex-row gap-2 z-10"
    >
      <button
        type="button"
        onClick={() => fitView()}
        aria-label="Fit view"
        title="Fit view"
        className="p-2 bg-background border border-accent rounded-md shadow-sm text-text hover:bg-accent"
      >
        <Maximize size={16} />
      </button>
      <button
        type="button"
        onClick={() => zoomOut()}
        aria-label="Zoom out"
        title="Zoom out"
        className="p-2 bg-background border border-accent rounded-md shadow-sm text-text hover:bg-accent"
      >
        <ZoomOut size={16} />
      </button>
      <button
        type="button"
        onClick={() => zoomIn()}
        aria-label="Zoom in"
        title="Zoom in"
        className="p-2 bg-background border border-accent rounded-md shadow-sm text-text hover:bg-accent"
      >
        <ZoomIn size={16} />
      </button>
    </div>
  );
};

export default memo(CustomControls);
