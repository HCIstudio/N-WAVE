# I/O monitor logs from real runs

Recorded by N-WAVE's I/O monitor (the eBPF monitor of Witzke et al.) during
runs of Demo 1, Demo 3 and the first workflow of the course Run Insight (whose
processes had no container of their own) on Docker Desktop with WSL 2 (kernel 6.18), for the
tests of `linkAccesses.ts`. For each run:

- `file-bpf.csv.gz`, `cgroups.csv.gz`: the monitor's two logs, with the padding
  of their columns removed, the results folder renamed to `/srv/nwave/results`,
  and opens outside the run's folder that their filter let through left out.
- `tasks.json`, `trace.json`: what N-WAVE's API answered for the run's tasks
  (from Nextflow's log) and its trace.

They hold no dates and no personal paths: every time counts from the run's
creation (`file-bpf.csv` in seconds, `cgroups.csv` in microseconds, the trace in
milliseconds), the run's id and its results folder end in their offset from that
moment (`_0`; Demo 1's folder, made a millisecond later, `_1`), and home folders
in paths read `/home/user`.

On that busy computer the monitor missed part of the accesses (see the I/O
monitor's wiki page); the tests check what the linking does with that.
