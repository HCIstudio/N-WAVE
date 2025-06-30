import type React from "react";
import { useState, useRef } from "react";
import { UploadCloud, Loader } from "lucide-react";
import axios, { AxiosError } from "axios";

interface FileInputProps {
  onUploadSuccess: (filePath: string) => void;
  onUploadError: (errorMessage: string) => void;
}

const API_BASE_URL = "http://localhost:5001";

const FileInput: React.FC<FileInputProps> = ({
  onUploadSuccess,
  onUploadError,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  const handleUpload = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    onUploadError(""); // Clear previous errors

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/upload`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      onUploadSuccess(response.data.filePath);
    } catch (err: unknown) {
      console.error("File upload error:", err);
      let message = "An unknown error occurred during upload.";
      if (err instanceof AxiosError) {
        message = `Upload failed: ${err.response?.data?.error || err.message}`;
      }
      onUploadError(message);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSelectFileClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        disabled={isUploading}
      />
      <button
        onClick={handleSelectFileClick}
        className="w-full flex items-center justify-center px-4 py-2 border border-dashed border-gray-500 rounded-md text-sm font-medium text-gray-300 hover:border-blue-500 hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        disabled={isUploading}
      >
        {isUploading ? (
          <>
            <Loader className="animate-spin mr-2" size={16} />
            <span>Uploading...</span>
          </>
        ) : (
          <>
            <UploadCloud className="mr-2" size={16} />
            <span>Select or Drop File</span>
          </>
        )}
      </button>
    </div>
  );
};

export default FileInput;
