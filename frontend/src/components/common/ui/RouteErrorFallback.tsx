import type React from "react";
import { isRouteErrorResponse, useRouteError } from "react-router-dom";
import ErrorFallback from "./ErrorFallback";

/** `errorElement` for the router: render errors and unknown routes. */
const RouteErrorFallback: React.FC = () => {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <ErrorFallback
        fullPage
        error={error}
        title="Page not found"
        description="There is nothing at this address. Head back to the workflow library to pick a workflow."
      />
    );
  }

  return <ErrorFallback fullPage error={error} />;
};

export default RouteErrorFallback;
