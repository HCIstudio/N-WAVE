import type React from "react";
import { AlertTriangle } from "lucide-react";

export interface ErrorFallbackProps {
  error: unknown;
  /** Heading shown above the message. */
  title?: string;
  /** Short explanation of what the user lost (or didn't). */
  description?: string;
  /** Re-render the failed subtree; omitted when retrying makes no sense. */
  onRetry?: () => void;
  /** Fill the viewport instead of the parent container. */
  fullPage?: boolean;
  /** Overrides the outer container's layout classes. */
  className?: string;
}

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "statusText" in error) {
    return String((error as { statusText: unknown }).statusText);
  }
  return "Unknown error";
};

const libraryHref = import.meta.env.BASE_URL || "/";

/** Friendly replacement UI for a subtree that threw while rendering. */
const ErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  title = "Something went wrong",
  description = "N-WAVE hit an unexpected error. Your last saved version of the workflow is safe.",
  onRetry,
  fullPage = false,
  className,
}) => (
  <div
    role="alert"
    className={
      className ??
      `flex items-center justify-center bg-background p-6 text-text ${
        fullPage ? "min-h-screen w-full" : "h-full w-full"
      }`
    }
  >
    <div className="w-full max-w-lg rounded-lg border border-panel-border bg-panel-background p-6 shadow-lg">
      <div className="flex items-center gap-3">
        <AlertTriangle className="h-6 w-6 shrink-0 text-warning" aria-hidden />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <p className="mt-3 text-sm text-text-light">{description}</p>
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-text-light">
          Technical details
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background p-3 text-xs text-danger">
          {errorMessage(error)}
        </pre>
      </details>
      <div className="mt-6 flex flex-wrap gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-nextflow-green px-4 py-2 text-white hover:bg-nextflow-green-dark"
          >
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-accent px-4 py-2 text-text hover:bg-accent-hover"
        >
          Reload page
        </button>
        <a
          href={libraryHref}
          className="rounded-md bg-accent px-4 py-2 text-text hover:bg-accent-hover"
        >
          Back to workflow library
        </a>
      </div>
    </div>
  </div>
);

export default ErrorFallback;
