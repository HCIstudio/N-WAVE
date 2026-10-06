import { Component, type ErrorInfo, type ReactNode } from "react";
import ErrorFallback, { type ErrorFallbackProps } from "./ErrorFallback";

interface ErrorBoundaryProps
  extends Omit<ErrorFallbackProps, "error" | "onRetry"> {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: unknown;
  hasError: boolean;
}

/**
 * Catches render errors in its subtree and shows ErrorFallback instead of a
 * blank page. "Try again" re-mounts the children.
 */
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error, hasError: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error("Unhandled render error:", error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null, hasError: false });
  };

  render(): ReactNode {
    const { children, ...fallbackProps } = this.props;
    if (!this.state.hasError) return children;

    return (
      <ErrorFallback
        {...fallbackProps}
        error={this.state.error}
        onRetry={this.reset}
      />
    );
  }
}

export default ErrorBoundary;
