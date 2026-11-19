# The I/O monitor's image

This image runs the eBPF I/O monitor of Witzke, Lößer, Bountris, Schintke and Scheuermann:
[Low-level I/O Monitoring for Scientific Workflows](https://doi.org/10.48550/arXiv.2408.00411)
(arXiv:2408.00411). N-WAVE uses their code with the authors' permission.

## Where the code comes from

| | |
| --- | --- |
| Repository | <https://github.com/CRC-FONDA/workflow-monitoring> |
| Commit | `757342ce29c580bbb585a601fc939357c3d31ca1` ("Update dependencies again for vulnerability fixes.") |
| Files used | `bpf/fileaccess.py`, `bpf/cgroup_informer.py`, `bpf/testdir/` |

The `Dockerfile` clones their repository at that commit (`WORKFLOW_MONITORING_COMMIT`) and
builds BCC 0.35.0 as their `bpf/Dockerfile.24.04` does, in a first stage; the image keeps only
what runs (Python, BCC's libraries, their programs). Each release publishes it as
`hcistudio/nwave-iomonitor:<version>` (`release.yml`, built on an amd64 and an arm64 runner),
and N-WAVE downloads it when the monitor is switched on. The image keeps the commit it was
built from in `/bpf/UPSTREAM_COMMIT`. To move to a newer commit of theirs, change
`WORKFLOW_MONITORING_COMMIT`, rebuild (`docker compose --profile monitor build iomonitor`),
and check that the patches still apply.

## What N-WAVE adds

- `nwave-monitor.sh`: the entrypoint. It finds the kernel's headers (the host's
  `/lib/modules`, then the kernel's own `kheaders`, then the distribution's package), starts
  both programs on the run's folder, and stops them when the run ends.
- `patches/0001-file-refcount-since-linux-6.13.patch`: Linux 6.13 renamed the file reference
  count that `fileaccess.py` reads (`f_count` became `f_ref`). The patch reads whichever the
  kernel has. It is offered back to the authors.

Everything else in their code is used unchanged. The wiki's
[I/O monitor](https://github.com/HCIstudio/N-WAVE/wiki/IO-Monitor) page says how N-WAVE runs
it and what it found on each platform.
