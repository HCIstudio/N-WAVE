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

  const baseClasses =
    "absolute bottom-4 right-4 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200";
  const stateClasses = isHovering
    ? "bg-red-500 text-white scale-110"
    : "bg-background text-text";

  return (
    <div id="delete-drop-zone" className={`${baseClasses} ${stateClasses}`}>
      <Trash2 size={20} />
    </div>
  );
};

export default DeleteDropZone;
