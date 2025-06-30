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

const toastConfig = {
  info: {
    icon: <Info className="text-blue-500" />,
    bgClass: "bg-white",
    textClass: "text-gray-800",
  },
  success: {
    icon: <CheckCircle className="text-green-500" />,
    bgClass: "bg-white",
    textClass: "text-gray-800",
  },
  warning: {
    icon: <AlertTriangle className="text-yellow-500" />,
    bgClass: "bg-white",
    textClass: "text-gray-800",
  },
  error: {
    icon: <XCircle className="text-white" />,
    bgClass: "bg-red-500",
    textClass: "text-white",
  },
};

const Toast: React.FC<ToastProps> = ({ message, type, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true); // Animate in
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // Wait for fade out animation
    }, 4000);

    return () => clearTimeout(timer);
  }, [message, type, onClose]);

  const { icon, bgClass, textClass } = toastConfig[type];

  return (
    <div
      className={clsx(
        "fixed top-5 left-1/2 -translate-x-1/2 min-w-[300px] rounded-lg shadow-lg overflow-hidden transition-all duration-300 z-50",
        bgClass,
        textClass,
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-10"
      )}
    >
      <div className="flex items-center p-4">
        <div className="mr-3 text-2xl">{icon}</div>
        <div>{message}</div>
      </div>
    </div>
  );
};

export default Toast;
