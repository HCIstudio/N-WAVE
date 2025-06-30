import type React from "react";
import { memo } from "react";
import { Panel } from "../../common";

interface FloatingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onDelete?: () => void;
  title: string;
  panelId: string;
  children: React.ReactNode;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  style?: React.CSSProperties;
  recenterTrigger?: number;
  onPositionChange: (x: number, y: number) => void;
  onResize: (x: number, y: number) => void;
}

const FloatingPanel: React.FC<FloatingPanelProps> = ({
  isOpen,
  onClose,
  onDelete,
  title,
  panelId,
  children,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  style,
  recenterTrigger,
  onPositionChange,
  onResize,
}) => {
  if (!isOpen) return null;

  return (
    <Panel
      title={title}
      panelId={panelId}
      onClose={onClose}
      onDelete={onDelete}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      style={style}
      recenterTrigger={recenterTrigger}
      onPositionChange={onPositionChange}
      onResize={onResize}
    >
      {children}
    </Panel>
  );
};

export default memo(FloatingPanel);
