import type React from "react";
import { useEffect, useState } from "react";
import { XCircle, Info, CheckCircle, AlertTriangle } from "lucide-react";
import clsx from "clsx";

export type ToastType = "info" | "success" | "warning" | "error";

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
}

// Toasts share the dark panel surface and signal their type with a colored
// left accent bar and icon, drawn from the semantic theme tokens.
const toastConfig = {
  info: {
    icon: <Info className="h-5 w-5 text-info" />,
    accentClass: "border-l-info",
  },
  success: {
    icon: <CheckCircle className="h-5 w-5 text-success" />,
    accentClass: "border-l-success",
  },
  warning: {
    icon: <AlertTriangle className="h-5 w-5 text-warning" />,
    accentClass: "border-l-warning",
  },
  error: {
    icon: <XCircle className="h-5 w-5 text-danger" />,
    accentClass: "border-l-danger",
  },
};

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  const [visible, setVisible] = useState(false);

  // Restart the show/auto-dismiss cycle whenever a new message arrives.
  // biome-ignore lint/correctness/useExhaustiveDependencies: message and type restart the timer.
  useEffect(() => {
    setVisible(true); // Animate in
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, 4000);

    return () => clearTimeout(timer);
  }, [message, type, onClose]);

  const { icon, accentClass } = toastConfig[type];

  return (
    <div
      className={clsx(
        "fixed top-5 left-1/2 -translate-x-1/2 min-w-[300px] max-w-md rounded-lg border border-panel-border border-l-4 bg-panel-background text-text shadow-lg transition-all duration-300 z-50",
        accentClass,
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-10"
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <div className="shrink-0 text-xl">{icon}</div>
        <div className="text-sm">{message}</div>
      </div>
    </div>
  );
};

export default Toast;
