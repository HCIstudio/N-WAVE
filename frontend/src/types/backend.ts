// This file contains type definitions for objects coming from the backend API.
// It helps to decouple frontend type definitions from backend source code.

export interface IFile {
  _id: string;
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  path: string;
  tags: string[];
  createdAt: Date;
}
