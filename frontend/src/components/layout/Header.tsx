import type React from "react";
import { useState, useRef, useEffect } from "react";
import { ProcessDropdown } from "../common";
import type { NextflowProcess } from "../../data/types";

interface HeaderProps {
  onProcessSelect: (process: NextflowProcess) => void;
}

const Header: React.FC<HeaderProps> = ({ onProcessSelect }) => {
  const [isDropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSelectProcess = (process: NextflowProcess) => {
    onProcessSelect(process);
    setDropdownOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="absolute top-4 right-4 z-10">
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen((prev) => !prev)}
          className="p-2 bg-background border border-accent rounded-md shadow-sm text-text hover:bg-accent"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        {isDropdownOpen && (
          <ProcessDropdown
            onSelectProcess={handleSelectProcess}
            onClose={() => setDropdownOpen(false)}
          />
        )}
      </div>
    </header>
  );
};

export default Header;
