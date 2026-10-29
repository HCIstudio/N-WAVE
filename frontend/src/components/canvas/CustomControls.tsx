import type React from "react";
import { memo } from "react";
import { useReactFlow } from "@xyflow/react";
import { useFeature } from "../../settings/useFeatures";
import { CircleHelp, Keyboard, Maximize, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";

export interface HistoryControls {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

const buttonClass =
  "p-2 bg-background border border-accent rounded-md shadow-sm text-text hover:bg-accent disabled:opacity-40 disabled:hover:bg-background disabled:cursor-not-allowed";

const CustomControls: React.FC<{
  history?: HistoryControls;
  onShowShortcuts?: () => void;
}> = ({ history, onShowShortcuts }) => {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const glossaryOn = useFeature("glossary");

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
      {onShowShortcuts && (
        <button
          type="button"
          onClick={onShowShortcuts}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
          className={buttonClass}
        >
          <Keyboard size={16} />
        </button>
      )}
      {/* Help opens in another tab, so the canvas stays as it is. */}
      {glossaryOn && (
        <a
          href={`${import.meta.env.BASE_URL}help`}
          target="_blank"
          rel="noreferrer"
          aria-label="Help"
          title="Help: what N-WAVE does, the node colors, and the glossary (opens in a new tab)"
          className={buttonClass}
        >
          <CircleHelp size={16} />
        </a>
      )}
    </div>
  );
};

export default memo(CustomControls);
