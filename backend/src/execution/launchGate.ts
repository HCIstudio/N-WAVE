// Runs of one nf-core pipeline share Nextflow's assets folder, where the
// first run downloads the pipeline. Two runs downloading it at once fail
// ("Destination path ... already exists"), so a run of a pipeline waits
// until any earlier run of it has got past the download: until Nextflow
// prints "Launching" (it has the pipeline) or the earlier run has ended.

const queues = new Map<string, Promise<void>>();

/** Wait for the gate of `key`; call the returned function to open it for the next run. */
export const passLaunchGate = async (key: string): Promise<() => void> => {
  const previous = queues.get(key) ?? Promise.resolve();
  let open = () => {};
  const mine = new Promise<void>((resolve) => {
    open = resolve;
  });
  const chained = previous.then(() => mine);
  queues.set(key, chained);
  await previous;
  let opened = false;
  return () => {
    if (opened) return;
    opened = true;
    open();
    // Forget the key once nobody waits behind this run.
    if (queues.get(key) === chained) queues.delete(key);
  };
};

/** Whether a run of `key` is still before or in its download. */
export const isLaunchGateBusy = (key: string): boolean => queues.has(key);

/** Whether Nextflow's output shows it has the pipeline and is starting it. */
export const isLaunchLine = (output: string): boolean => /(^|\n)Launching `/.test(output);
