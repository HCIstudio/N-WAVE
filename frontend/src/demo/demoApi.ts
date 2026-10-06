// Axios-compatible client used in the browser-only demo build.
//
// It exposes the same get/post/put/delete surface as the real axios instance in
// api.ts, but resolves requests against the in-browser demoStore instead of the
// backend. Call sites (HomePage, WorkflowPage, FileInputPanel, useExecution
// status) don't change — they still get `{ data }` responses and axios-shaped
// errors (`error.response.status`, `error.response.data.message`).

import { demoCustomNodes } from "./demoCustomNodes";
import { demoStore, DemoStoreError, type WorkflowPayload } from "./demoStore";

interface DemoResponse<T = unknown> {
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

// The nf-core support (manifest building, catalog loading) is only needed
// when the library is used, so it is loaded on demand, outside the entry chunk.
const loadNfCore = () => import("./demoNfCore");

/** runStore for async handlers: store errors become axios-shaped errors. */
const runAsync = <T>(fn: () => Promise<T>): Promise<DemoResponse<T>> =>
  fn().then(
    (data) => ({ data, status: 200 }),
    (error: unknown) => {
      if (error instanceof DemoStoreError) {
        return fail(error.status, error.message);
      }
      return fail(
        500,
        error instanceof Error ? error.message : "Demo store error"
      );
    }
  );

const EXECUTION_DISABLED_MESSAGE =
  "Workflow execution is disabled in the hosted demo. Download the Docker version to run workflows for real. You can still build, edit, import and inspect the generated Nextflow script here.";

const demoApi = {
  get<T = unknown>(url: string): Promise<DemoResponse<T>> {
    const path = normalize(url);
    if (path === "/custom-nodes") {
      return ok(demoCustomNodes.list() as T);
    }
    if (path === "/nfcore/catalog") {
      return runAsync(
        async () => (await loadNfCore()).demoNfCore.catalog() as Promise<T>
      );
    }
    if (path === "/nfcore/installed") {
      return runAsync(
        async () => (await loadNfCore()).demoNfCore.installed() as Promise<T>
      );
    }
    if (path === "/nfcore/modules/files") {
      const id = new URL(url, "http://demo").searchParams.get("id") ?? "";
      return loadNfCore()
        .then(({ fetchNfCoreModuleFiles }) => fetchNfCoreModuleFiles(id))
        .then(
          (files) => ok({ id, files } as T),
          (error: unknown) =>
            fail(404, error instanceof Error ? error.message : String(error))
        );
    }
    if (path === "/nfcore/modules/source") {
      const id = new URL(url, "http://demo").searchParams.get("id") ?? "";
      return loadNfCore()
        .then(({ fetchNfCoreModuleSource }) => fetchNfCoreModuleSource(id))
        .then(
        (source) => ok({ id, source } as T),
        (error: unknown) =>
          fail(404, error instanceof Error ? error.message : String(error))
      );
    }
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

    // No backend runtime in the demo, so Docker/Nextflow are simply unavailable.
    // Returning the same shape as the real endpoints keeps the settings UI happy
    // (it shows "unavailable") without firing a request that would 404.
    if (path === "/execute/docker-status") {
      return ok({
        dockerAvailable: false,
        error: EXECUTION_DISABLED_MESSAGE,
      } as T);
    }
    if (path === "/execute/nextflow-status") {
      return ok({
        nextflowAvailable: false,
        dockerNextflowAvailable: false,
        error: EXECUTION_DISABLED_MESSAGE,
      } as T);
    }

    return fail(404, `No demo handler for GET ${path}`);
  },

  post<T = unknown>(url: string, data?: unknown): Promise<DemoResponse<T>> {
    const path = normalize(url);

    if (path === "/workflows") {
      // Callers send the same bodies the real API validates.
      return runStore(() => demoStore.create(data as WorkflowPayload) as T);
    }
    const duplicateMatch = path.match(/^\/workflows\/([^/]+)\/duplicate$/);
    if (duplicateMatch) {
      return runStore(
        () => demoStore.duplicate(decodeURIComponent(duplicateMatch[1])) as T
      );
    }

    if (path === "/nfcore/install" || path === "/nfcore/uninstall") {
      const id = (data as { id?: unknown } | undefined)?.id;
      if (typeof id !== "string" || id.trim() === "") {
        return fail(400, "Module id is required");
      }
      return runAsync(async () => {
        const { demoNfCore } = await loadNfCore();
        return (path === "/nfcore/install"
          ? demoNfCore.install(id.trim())
          : demoNfCore.uninstall(id.trim())) as Promise<T>;
      });
    }

    if (path === "/custom-nodes") {
      return runStore(
        () =>
          demoCustomNodes.save(
            (data as { node: Parameters<typeof demoCustomNodes.save>[0] }).node
          ) as T
      );
    }

    // Execution can't run in a static, backend-less demo.
    if (path === "/execute/execute") {
      return fail(501, EXECUTION_DISABLED_MESSAGE);
    }
    // Cancelling a (non-existent) run is a harmless no-op.
    if (path === "/execute/cancel") {
      return ok({ message: "No active execution in demo mode" } as T);
    }
    return fail(404, `No demo handler for POST ${path}`);
  },

  put<T = unknown>(url: string, data?: unknown): Promise<DemoResponse<T>> {
    const path = normalize(url);
    const workflowMatch = path.match(/^\/workflows\/([^/]+)$/);
    if (workflowMatch) {
      return runStore(
        () =>
          demoStore.update(
            decodeURIComponent(workflowMatch[1]),
            data as WorkflowPayload
          ) as T
      );
    }
    return fail(404, `No demo handler for PUT ${path}`);
  },

  delete<T = unknown>(url: string): Promise<DemoResponse<T>> {
    const path = normalize(url);
    const workflowMatch = path.match(/^\/workflows\/([^/]+)$/);
    if (workflowMatch) {
      return runStore(() => {
        demoStore.remove(decodeURIComponent(workflowMatch[1]));
        return { message: "Workflow deleted successfully" } as T;
      });
    }
    const customNodeMatch = path.match(/^\/custom-nodes\/([^/]+)$/);
    if (customNodeMatch) {
      const id = decodeURIComponent(customNodeMatch[1]);
      return demoCustomNodes.remove(id)
        ? ok({ id } as T)
        : fail(404, "Custom node not found");
    }
    return fail(404, `No demo handler for DELETE ${path}`);
  },
};

export default demoApi;
