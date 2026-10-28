// Memory amounts as Nextflow writes them ("4.GB", "512 MB").

const UNITS: Record<string, number> = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };

/** Bytes in a memory amount, or NaN when it can't be read. */
export const memoryBytes = (memory: string): number => {
  const match = memory?.trim().match(/^(\d+(?:\.\d+)?)\s*\.?\s*([KMGT]?B)$/i);
  if (!match) return Number.NaN;
  return Number(match[1]) * (UNITS[match[2].toUpperCase()] ?? Number.NaN);
};

/** The smaller of two memory amounts (the first when one can't be read). */
export const smallerMemory = (a: string, b: string): string =>
  memoryBytes(b) < memoryBytes(a) ? b : a;

/** "4.GB" → "4 GB". */
export const formatMemory = (memory: string): string => memory.replace(".", " ");
