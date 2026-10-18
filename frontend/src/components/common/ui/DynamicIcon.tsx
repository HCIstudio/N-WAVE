import type React from "react";
import type { LucideProps } from "lucide-react";
import { getIcon } from "./iconRegistry";

interface DynamicIconProps extends LucideProps {
  name: string;
}

const DynamicIcon: React.FC<DynamicIconProps> = ({ name, ...props }) => {
  // Unknown names (including "constructor", "__proto__") fall back to Code.
  const LucideIcon = getIcon(name) ?? getIcon("Code");

  if (!LucideIcon) {
    return null;
  }

  return <LucideIcon {...props} />;
};

export default DynamicIcon;
