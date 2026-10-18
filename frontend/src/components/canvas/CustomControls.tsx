import type React from "react";
import { memo } from "react";
import { useReactFlow } from "@xyflow/react";
import { ZoomIn, ZoomOut, Maximize, Undo2, Redo2 } from "lucide-react";

export interface HistoryControls {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

const buttonClass =
  "p-2 bg-background border border-accent rounded-md shadow-sm text-text hover:bg-accent disabled:opacity-40 disabled:hover:bg-background disabled:cursor-not-allowed";

const CustomControls: React.FC<{ history?: HistoryControls }> = ({
  history,
}) => {
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
      {history && (
        <>
          <button
            type="button"
            onClick={history.undo}
            disabled={!history.canUndo}
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            className={buttonClass}
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            onClick={history.redo}
            disabled={!history.canRedo}
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            className={buttonClass}
          >
            <Redo2 size={16} />
          </button>
        </>
      )}
    </div>
  );
};

export default memo(CustomControls);
