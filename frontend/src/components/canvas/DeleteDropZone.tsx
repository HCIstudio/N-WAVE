// The bin a dragged node can be dropped on to delete it; shown while a node is dragged.

import type React from "react";
import { Trash2 } from "lucide-react";

interface DeleteDropZoneProps {
  isDragging: boolean;
  isHovering: boolean;
}

const DeleteDropZone: React.FC<DeleteDropZoneProps> = ({
  isDragging,
  isHovering,
}) => {
  if (!isDragging) {
    return null;
  }

  // Above the Runs bar (bottom right), over everything on the canvas, so a
  // node can always be dropped on it.
  const baseClasses =
    "fixed bottom-20 right-4 z-40 flex h-14 w-14 flex-col items-center justify-center rounded-full border-2 shadow-lg transition-all duration-200";
  const stateClasses = isHovering
    ? "scale-110 border-red-500 bg-red-500 text-white"
    : "border-dashed border-red-400 bg-background text-text";

  return (
    <div
      id="delete-drop-zone"
      role="img"
      aria-label="Drop here to delete"
      title="Drop the node here to delete it (Undo brings it back)"
      className={`${baseClasses} ${stateClasses}`}
    >
      <Trash2 size={20} aria-hidden />
    </div>
  );
};

export default DeleteDropZone;
