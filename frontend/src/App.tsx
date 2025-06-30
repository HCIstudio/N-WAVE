import type React from "react";
import { useEffect } from "react";
import { Outlet } from "react-router-dom";

const App: React.FC = () => {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    document.addEventListener("contextmenu", handleContextMenu);

    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  return <Outlet />;
};

export default App;
