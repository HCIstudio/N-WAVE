// The I/O monitor's switch (Global Settings → I/O monitor), and what its
// beta note says wherever the monitor's results show.

import type { FeatureSwitch } from "../pages/settings/FeatureSettings";

/**
 * The monitor's switch. It is in beta: it works, but where it sees the whole
 * machine it can miss file accesses, and that is still being tested.
 */
export const IO_MONITOR_SWITCH: FeatureSwitch = {
  id: "ioMonitor",
  label: "I/O monitor",
  off: "runs aren't monitored, and the steps' Results show no file accesses.",
  beta: "on Docker Desktop and WSL 2 the monitor sees the whole machine and can miss file accesses.",
};
