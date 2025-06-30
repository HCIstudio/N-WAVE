import { Schema, model, Document } from "mongoose";

export interface IFile extends Document {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  fileType: string; // Detected file type (fastq, fasta, etc.)
  tags: string[];
  createdAt: Date;
  // Note: No content field - files are handled in browser storage

  // Methods
  detectFileType(): string;
}

const fileSchema = new Schema<IFile>({
  filename: { type: String, required: true, unique: true },
  originalName: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  fileType: { type: String }, // Optional detected file type
  tags: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
});

// Helper method to detect file type from extension
fileSchema.methods.detectFileType = function () {
  const extension = this.originalName.toLowerCase().split(".").pop() || "";
  this.fileType = extension;
  return extension;
};

const File = model<IFile>("File", fileSchema);

export default File;
