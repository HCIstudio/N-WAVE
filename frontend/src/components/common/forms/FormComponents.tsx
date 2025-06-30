import type React from "react";
import FileInput from "./FileInput";
import InlineEdit from "./InlineEdit";
import ProcessDropdown from "./ProcessDropdown";
import SearchInput from "./SearchInput";
import TimeInput from "./TimeInput";
import MemoryInput from "./MemoryInput";

// Common form styling classes
const baseInputClasses =
  "w-full p-2 rounded-md border-accent bg-background text-text shadow-sm focus:border-nextflow-green focus:ring-nextflow-green";
const baseLabelClasses = "block text-sm font-medium text-text-light mb-1";

interface FormFieldProps {
  label: string;
  id?: string;
  children: React.ReactNode;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  id,
  children,
}) => (
  <div>
    <label htmlFor={id} className={baseLabelClasses}>
      {label}
    </label>
    {children}
  </div>
);

interface SelectFieldProps {
  label: string;
  id: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  id,
  name,
  value,
  onChange,
  children,
}) => (
  <FormField label={label} id={id}>
    <select
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      className={baseInputClasses}
    >
      {children}
    </select>
  </FormField>
);

interface InputFieldProps {
  label: string;
  id: string;
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}

export const InputField: React.FC<InputFieldProps> = ({
  label,
  id,
  name,
  value,
  onChange,
  placeholder = "",
  type = "text",
}) => (
  <FormField label={label} id={id}>
    <input
      type={type}
      id={id}
      name={name}
      value={value}
      onChange={onChange}
      className={baseInputClasses}
      placeholder={placeholder}
    />
  </FormField>
);

interface CheckboxFieldProps {
  label: string;
  id: string;
  name: string;
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const CheckboxField: React.FC<CheckboxFieldProps> = ({
  label,
  id,
  name,
  checked,
  onChange,
}) => (
  <div className="flex items-center">
    <input
      type="checkbox"
      id={id}
      name={name}
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 rounded border-gray-300 text-nextflow-green focus:ring-nextflow-green"
    />
    <label htmlFor={id} className="ml-2 block text-sm text-text">
      {label}
    </label>
  </div>
);

interface OperatorHeaderProps {
  title: string;
}

export const OperatorHeader: React.FC<OperatorHeaderProps> = ({ title }) => (
  <h3 className="text-md font-semibold text-text border-b border-accent pb-2">
    Operation: {title}
  </h3>
);

export {
  FileInput,
  InlineEdit,
  ProcessDropdown,
  SearchInput,
  TimeInput,
  MemoryInput,
};
