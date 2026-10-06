import type React from "react";
import type { LucideProps } from "lucide-react";
import { iconRegistry } from "./iconRegistry";

interface DynamicIconProps extends LucideProps {
  name: string;
}

const DynamicIcon: React.FC<DynamicIconProps> = ({ name, ...props }) => {
  const LucideIcon = iconRegistry[name];

  if (!LucideIcon) {
    return null;
  }

  return <LucideIcon {...props} />;
};

export default DynamicIcon;
