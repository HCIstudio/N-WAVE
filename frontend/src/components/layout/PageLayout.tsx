import type React from "react";

interface PageLayoutProps {
  children: React.ReactNode;
}

const PageLayout: React.FC<PageLayoutProps> = ({ children }) => {
  return (
    <div className="bg-background text-text min-h-screen w-full">
      {children}
    </div>
  );
};

export default PageLayout;
