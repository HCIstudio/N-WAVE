import axios from "axios";
import demoApi from "./demo/demoApi";

/**
 * True when the app was built for the backend-less demo (GitHub Pages).
 * Set VITE_DEMO_MODE=true at build time to enable it.
 */
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === "true";

const axiosApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
});

// In demo mode all requests resolve against in-browser storage (see
// demo/demoApi.ts). Otherwise they hit the real backend over HTTP. The demo
// client implements the subset of the axios surface the app uses, so it's cast
// to the axios instance type to keep call sites (and their typings) unchanged.
const api = isDemoMode
  ? (demoApi as unknown as typeof axiosApi)
  : axiosApi;

export default api;
