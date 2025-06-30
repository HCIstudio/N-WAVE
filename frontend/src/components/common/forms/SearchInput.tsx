import type React from "react";

interface SearchInputProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onIconClick?: () => void;
  placeholder: string;
  containerClassName?: string;
  inputClassName?: string;
}

const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  onIconClick,
  placeholder,
  containerClassName = "",
  inputClassName = "",
}) => {
  // Default input classes, allowing overrides and additions via inputClassName
  const defaultInputClasses =
    "w-full pl-10 pr-4 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 transition-colors border-accent bg-background text-text shadow-sm focus:border-nextflow-green focus:ring-nextflow-green";

  return (
    <div className={`relative ${containerClassName}`}>
      <div
        className={`absolute inset-y-0 left-0 pl-3 flex items-center cursor-pointer`}
        onClick={onIconClick}
        role={onIconClick ? "button" : undefined}
        tabIndex={onIconClick ? 0 : undefined}
        onKeyDown={
          onIconClick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  onIconClick();
                }
              }
            : undefined
        }
        aria-label={onIconClick ? "Trigger search" : undefined}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          className="w-5 h-5 text-gray-400"
          aria-hidden="true" // Decorative if onIconClick is not provided or if input has placeholder
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={`${defaultInputClasses} ${inputClassName}`}
      />
    </div>
  );
};

export default SearchInput;
