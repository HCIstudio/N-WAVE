import type React from "react";
import { useState, useRef, useEffect, type KeyboardEvent } from "react";

interface InlineEditProps {
  value: string;
  onSave: (value: string) => void;
  isTextarea?: boolean;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

const InlineEdit: React.FC<InlineEditProps> = ({
  value,
  onSave,
  isTextarea = false,
  className = "",
  inputClassName = "",
  placeholder = "Click to edit",
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleClick = () => {
    setIsEditing(true);
  };

  const handleBlur = () => {
    if (currentValue.trim() !== "" && currentValue !== value) {
      onSave(currentValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleBlur();
    }
    if (e.key === "Escape") {
      setCurrentValue(value);
      setIsEditing(false);
    }
  };

  const commonInputProps = {
    ref: inputRef as any,
    value: currentValue,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCurrentValue(e.target.value),
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    className: `bg-transparent focus:outline-none w-full ${inputClassName}`,
  };

  if (isEditing) {
    return isTextarea ? (
      <textarea {...commonInputProps} rows={1} />
    ) : (
      <input type="text" {...commonInputProps} />
    );
  }

  return (
    <div onClick={handleClick} className={`cursor-pointer ${className}`}>
      {value || <span className="text-gray-400">{placeholder}</span>}
    </div>
  );
};

export default InlineEdit;
