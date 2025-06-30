import type React from "react";
import { icons } from "lucide-react";
import type { LucideProps } from "lucide-react";

interface DynamicIconProps extends LucideProps {
  name: string;
}

const DynamicIcon: React.FC<DynamicIconProps> = ({ name, ...props }) => {
  const LucideIcon = icons[name as keyof typeof icons];

  if (!LucideIcon) {
    return null; // or a fallback icon
  }

  return <LucideIcon {...props} />;
};

export default DynamicIcon;
