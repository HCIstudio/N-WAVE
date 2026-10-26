import base from "./playwright.config";
export default {
  ...base,
  use: { ...base.use, launchOptions: { executablePath: "/opt/pw-browsers/chromium" } },
  projects: [{ name: "chromium", use: { ...base.projects?.[0]?.use, launchOptions: { executablePath: "/opt/pw-browsers/chromium" } } }],
};
