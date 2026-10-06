import type { Request, Response } from "express";
import type { ZodError, ZodType, ZodTypeDef } from "zod";

/** Flatten zod issues into `path: message` strings for the API response. */
export const formatZodIssues = (error: ZodError): string[] =>
  error.issues.map((issue) =>
    issue.path.length > 0
      ? `${issue.path.join(".")}: ${issue.message}`
      : issue.message
  );

/**
 * Validate `req.body` against a schema. On failure, sends a 400 response and
 * returns null, so callers can `if (!body) return;`.
 */
export const parseBody = <T>(
  schema: ZodType<T, ZodTypeDef, unknown>,
  req: Request,
  res: Response
): T | null => {
  const result = schema.safeParse(req.body ?? {});
  if (result.success) return result.data;

  res.status(400).json({
    message: "Invalid request body",
    // `error` keeps the single-message field the API has always returned.
    error: result.error.issues[0]?.message ?? "Invalid request body",
    details: formatZodIssues(result.error),
  });
  return null;
};
