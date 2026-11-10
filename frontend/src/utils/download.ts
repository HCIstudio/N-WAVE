/** Save a blob as a file download. */
export const downloadBlob = (blob: Blob, fileName: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/** Save text as a file download. */
export const downloadText = (text: string, fileName: string, type = "text/plain;charset=utf-8"): void =>
  downloadBlob(new Blob([text], { type }), fileName);
