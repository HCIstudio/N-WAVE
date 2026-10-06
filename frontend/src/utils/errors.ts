// Helpers for reading unknown thrown values (axios errors, DOMExceptions,
// plain Errors) without falling back to `any`.

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | undefined =>
  value !== null && typeof value === "object"
    ? (value as UnknownRecord)
    : undefined;

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/** `error.message` when present, otherwise `fallback`. */
export const getErrorMessage = (error: unknown, fallback: string): string =>
  nonEmptyString(asRecord(error)?.message) ?? fallback;

/** `error.name` (e.g. "AbortError" for DOMExceptions), if any. */
export const getErrorName = (error: unknown): string | undefined =>
  nonEmptyString(asRecord(error)?.name);

/** HTTP status of an axios-style error (`error.response.status`). */
export const getResponseStatus = (error: unknown): number | undefined => {
  const status = asRecord(asRecord(error)?.response)?.status;
  return typeof status === "number" ? status : undefined;
};

/**
 * Body of an axios-style error response (`error.response.data`). Requests made
 * with `responseType: "text"` (the streaming execute call) receive the JSON
 * error body as a string, so that is parsed too.
 */
export const getResponseData = (error: unknown): UnknownRecord | undefined => {
  const data = asRecord(asRecord(error)?.response)?.data;
  if (typeof data !== "string") return asRecord(data);
  try {
    return asRecord(JSON.parse(data));
  } catch {
    return undefined;
  }
};

/**
 * Best message for an API failure: the backend's `message` or `error` field,
 * then the error's own message, then `fallback`.
 */
export const getApiErrorMessage = (error: unknown, fallback: string): string => {
  const data = getResponseData(error);
  return (
    nonEmptyString(data?.message) ??
    nonEmptyString(data?.error) ??
    getErrorMessage(error, fallback)
  );
};
