// Axios-compatible client used in the browser-only demo build.
//
// It exposes the same get/post/put/delete surface as the real axios instance in
// api.ts, but resolves requests against the in-browser demoStore instead of the
// backend. Call sites (HomePage, WorkflowPage, FileInputPanel, useExecution
// status) don't change — they still get `{ data }` responses and axios-shaped
// errors (`error.response.status`, `error.response.data.message`).

import { demoStore, DemoStoreError } from "./demoStore";

interface DemoResponse<T = any> {
  data: T;
  status: number;
}

/** An error shaped like an axios error so existing catch blocks keep working. */
class DemoApiError extends Error {
  response: { status: number; data: { message: string; error: string } };
  code: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "DemoApiError";
    this.code = status;
    this.response = { status, data: { message, error: message } };
  }
}

const ok = <T>(data: T, status = 200): Promise<DemoResponse<T>> =>
  Promise.resolve({ data, status });

const fail = (status: number, message: string): Promise<never> =>
  Promise.reject(new DemoApiError(status, message));

// Normalize "/api/workflows" and "/workflows" to a common form, drop querystring.
const normalize = (url: string): string =>
  url.replace(/^\/?api/, "").replace(/\?.*$/, "").replace(/\/+$/, "") || "/";

const runStore = <T>(fn: () => T): Promise<DemoResponse<T>> => {
  try {
    return ok(fn());
  } catch (error) {
    if (error instanceof DemoStoreError) {
      return fail(error.status, error.message);
    }
    const message = error instanceof Error ? error.message : "Demo store error";
    return fail(500, message);
  }
};

const EXECUTION_DISABLED_MESSAGE =
  "Workflow execution is disabled in the hosted demo. Download the Docker version to run workflows for real. You can still build, edit, import and inspect the generated Nextflow script here.";

const demoApi = {
  get<T = any>(url: string): Promise<DemoResponse<T>> {
    const path = normalize(url);
    if (path === "/workflows") {
      return ok(demoStore.list() as T);
    }
    const workflowMatch = path.match(/^\/workflows\/([^/]+)$/);
    if (workflowMatch) {
      const workflow = demoStore.get(decodeURIComponent(workflowMatch[1]));
      return workflow
        ? ok(workflow as T)
        : fail(404, "Workflow not found");
    }
    return fail(404, `No demo handler for GET ${path}`);
  },

  post<T = any>(url: string, data?: any): Promise<DemoResponse<T>> {
    const path = normalize(url);

    if (path === "/workflows") {
      return runStore(() => demoStore.create(data) as T);
    }
    const duplicateMatch = path.match(/^\/workflows\/([^/]+)\/duplicate$/);
    if (duplicateMatch) {
      return runStore(
        () => demoStore.duplicate(decodeURIComponent(duplicateMatch[1])) as T
      );
    }

    // Execution can't run in a static, backend-less demo.
    if (path === "/execute") {
      return fail(501, EXECUTION_DISABLED_MESSAGE);
    }
    // Cancelling a (non-existent) run is a harmless no-op.
    if (path === "/execute/cancel") {
      return ok({ message: "No active execution in demo mode" } as T);
    }
    // File "registration" is only backend persistence; the file content already
    // lives on the node, so return a synthetic id and move on.
    if (path === "/files/register") {
      return ok({ _id: `demo-file-${Date.now().toString(36)}` } as T);
    }

    return fail(404, `No demo handler for POST ${path}`);
  },

  put<T = any>(url: string, data?: any): Promise<DemoResponse<T>> {
    const path = normalize(url);
    const workflowMatch = path.match(/^\/workflows\/([^/]+)$/);
    if (workflowMatch) {
      return runStore(
        () => demoStore.update(decodeURIComponent(workflowMatch[1]), data) as T
      );
    }
    return fail(404, `No demo handler for PUT ${path}`);
  },

  delete<T = any>(url: string): Promise<DemoResponse<T>> {
    const path = normalize(url);
    const workflowMatch = path.match(/^\/workflows\/([^/]+)$/);
    if (workflowMatch) {
      return runStore(() => {
        demoStore.remove(decodeURIComponent(workflowMatch[1]));
        return { message: "Workflow deleted successfully" } as T;
      });
    }
    // File deletion is backend-only bookkeeping; treat as success.
    if (/^\/files\/[^/]+$/.test(path)) {
      return ok({ message: "File removed" } as T);
    }
    return fail(404, `No demo handler for DELETE ${path}`);
  },
};

export default demoApi;
