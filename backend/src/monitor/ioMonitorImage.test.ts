import { beforeEach, describe, expect, it, vi } from "vitest";

// Docker, as the monitor's status and download see it.
const docker = { present: false, pullWorks: true, pulls: 0, pullDone: Promise.resolve() };
vi.mock("node:child_process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:child_process")>()),
  exec: (command: string, _options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    if (command.startsWith("docker image inspect")) {
      callback(docker.present ? null : new Error("no such image"), "", docker.present ? "" : "Error: No such image");
    } else if (command.startsWith("docker pull")) {
      docker.pulls += 1;
      void docker.pullDone.then(() => {
        if (docker.pullWorks) docker.present = true;
        callback(docker.pullWorks ? null : new Error("pull"), "", docker.pullWorks ? "" : "Error response from daemon: manifest unknown");
      });
    } else callback(new Error(`unexpected: ${command}`), "", "");
  },
}));
vi.mock("../execution/shell", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../execution/shell")>()),
  readCommandOutput: async () => "6.18.0-test|Docker Desktop",
}));

const { ensureIoMonitorImage, getIoMonitorStatus, readIoMonitorConfig } = await import("./ioMonitor");

describe("the I/O monitor's image", () => {
  beforeEach(() => {
    Object.assign(docker, { present: false, pullWorks: true, pulls: 0, pullDone: Promise.resolve() });
  });

  it("is downloaded once when it isn't here, also when several ask, and then it can run", async () => {
    const config = readIoMonitorConfig({ NWAVE_IO_MONITOR_IMAGE: "hcistudio/nwave-iomonitor:9.9.1" });
    // Not downloaded yet: it can run; the image comes when the monitor is switched on.
    expect(await getIoMonitorStatus(config)).toEqual({
      image: "hcistudio/nwave-iomonitor:9.9.1",
      imagePresent: false,
      available: true,
      downloading: false,
      kernel: "6.18.0-test",
      system: "Docker Desktop",
    });
    let finish = () => {};
    docker.pullDone = new Promise((resolve) => {
      finish = resolve;
    });
    const first = ensureIoMonitorImage(config);
    const second = ensureIoMonitorImage(config);
    await vi.waitFor(() => expect(docker.pulls).toBe(1));
    expect(await getIoMonitorStatus(config)).toMatchObject({ available: true, downloading: true, imagePresent: false });
    finish();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(docker.pulls).toBe(1);
    expect(await getIoMonitorStatus(config)).toMatchObject({ available: true, imagePresent: true });
    // Here now: nothing more to download.
    expect(await ensureIoMonitorImage(config)).toBe(true);
    expect(docker.pulls).toBe(1);
  });

  it("says why it can't run when the download failed, and tries again when asked", async () => {
    const config = readIoMonitorConfig({ NWAVE_IO_MONITOR_IMAGE: "hcistudio/nwave-iomonitor:9.9.2" });
    docker.pullWorks = false;
    expect(await ensureIoMonitorImage(config)).toBe(false);
    expect(await getIoMonitorStatus(config)).toMatchObject({
      available: false,
      reason:
        "The monitor's image hcistudio/nwave-iomonitor:9.9.2 could not be downloaded (Error response from daemon: manifest unknown). Switch the monitor off and on again to try again.",
    });
    docker.pullWorks = true;
    expect(await ensureIoMonitorImage(config)).toBe(true);
    expect(await getIoMonitorStatus(config)).toMatchObject({ available: true, imagePresent: true });
  });

  it("isn't downloaded where the installation never runs the monitor", async () => {
    const config = readIoMonitorConfig({ NWAVE_IO_MONITOR: "off" });
    expect(await getIoMonitorStatus(config)).toMatchObject({ available: false, reason: expect.stringContaining("NWAVE_IO_MONITOR=off") });
    expect(await ensureIoMonitorImage(config)).toBe(false);
    expect(docker.pulls).toBe(0);
  });
});
