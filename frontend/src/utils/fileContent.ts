// Uploaded files as the workflow carries them: text files as text (previews,
// filters and viewers read them), anything else (gzipped FASTQ, BAM) as
// base64, marked with `encoding: "base64"` so it reaches the run byte for
// byte. Files saved before this have no encoding and are text.

export type FileEncoding = "base64";

export interface FileContent {
  content: string;
  encoding?: FileEncoding;
}

/** Bytes as base64, in chunks (String.fromCharCode takes limited arguments). */
export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

export const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** The text of the bytes, or null when they aren't UTF-8 text. */
const asText = (bytes: Uint8Array): string | null => {
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

/** File bytes as the workflow keeps them: text, or base64 for binary files. */
export const encodeFileContent = (bytes: Uint8Array): FileContent => {
  const text = asText(bytes);
  return text === null ? { content: bytesToBase64(bytes), encoding: "base64" } : { content: text };
};

/**
 * The largest file a run can take: input files travel in the run request,
 * which the backend accepts up to 50 MB (binary files grow by a third as
 * base64).
 */
export const MAX_UPLOAD_BYTES = 36 * 1024 * 1024;

/** An upload N-WAVE refuses, with a message for the user. */
export class UploadRefusedError extends Error {}

/** Read an uploaded file; throws, saying why, when it is too large to run. */
export const readUploadedFile = async (file: File): Promise<FileContent> => {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadRefusedError(
      `“${file.name}” is ${formatBytes(file.size)}: uploads can be up to ${formatBytes(MAX_UPLOAD_BYTES)}. For larger files, put their path or URL in a Samplesheet or Parameters node instead.`,
    );
  }
  return encodeFileContent(new Uint8Array(await file.arrayBuffer()));
};

/** A file's bytes, from its content and encoding. */
export const fileBytes = ({ content, encoding }: FileContent): Uint8Array =>
  encoding === "base64" ? base64ToBytes(content) : new TextEncoder().encode(content);

/** The size of a file's bytes, without decoding it. */
export const fileByteLength = ({ content, encoding }: FileContent): number => {
  if (encoding !== "base64") return new TextEncoder().encode(content).length;
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  return Math.floor((content.length * 3) / 4) - padding;
};

export const isBinaryFile = (file: { encoding?: FileEncoding }): boolean => file.encoding === "base64";

/** "12.3 KB", for telling a file's size. */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
};
