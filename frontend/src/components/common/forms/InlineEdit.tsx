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
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  useEffect(() => {
    const field = isTextarea ? textareaRef.current : inputRef.current;
    if (isEditing && field) {
      field.focus();
      field.select();
    }
  }, [isEditing, isTextarea]);

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
    value: currentValue,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCurrentValue(e.target.value),
    onBlur: handleBlur,
    onKeyDown: handleKeyDown,
    className: `bg-transparent focus:outline-none w-full ${inputClassName}`,
  };

  if (isEditing) {
    return isTextarea ? (
      <textarea ref={textareaRef} {...commonInputProps} rows={1} />
    ) : (
      <input ref={inputRef} type="text" {...commonInputProps} />
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`block w-full cursor-pointer text-left ${className}`}
    >
      {value || <span className="text-gray-400">{placeholder}</span>}
    </button>
  );
};

export default InlineEdit;
