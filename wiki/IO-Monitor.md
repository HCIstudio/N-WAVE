The I/O monitor records every file a run's steps open, read, write and delete, and when. It is
the eBPF monitor of Witzke et al.,
[Low-level I/O Monitoring for Scientific Workflows](https://arxiv.org/abs/2408.00411)
([their code](https://github.com/CRC-FONDA/workflow-monitoring)), run next to a run. It is
**off** by default and needs an installation; the browser demo can't use it.

## Beta

The I/O monitor is a **beta** feature: it works, but is still being tested on different
machines. Global Settings and the run panel's note on the monitor mark it **Beta**. What is
under test: on Docker Desktop and WSL 2 the monitor sees the whole machine, not only N-WAVE's
runs, and on a busy machine it can miss file accesses. N-WAVE checks every monitored run for
that and says what was missed ([Lost events](#lost-events)). What is known on each platform is
in [Where it works](#where-it-works).

To report how it works on your machine, follow **Report how it works on yours** next to the
**Beta** label, or open the
[Beta feature test report](https://github.com/HCIstudio/N-WAVE/issues/new?template=beta_feedback.yml&title=%5BBeta%5D%20I%2FO%20monitor)
form on GitHub: N-WAVE's version, where it runs (Linux, Docker Desktop on Windows or macOS), the
kernel (`docker info --format '{{.KernelVersion}}'`), what you ran, and what the run's
**Performance** tab said about lost or unlinked accesses. Reports from every platform help, also
when everything worked. Leave out anything private, such as paths with your name.

## What it does

When it is on, every run starts the monitor in a container of its own before Nextflow starts,
and stops it after the run ends. Its two programs load small probes into the Linux kernel
(eBPF, through [BCC](https://github.com/iovisor/bcc)):

- `fileaccess.py` records each open, read, write and close of a file under the run's folder:
  the time, the process, the file, the offset, the size and the path. Deletes aren't recorded:
  their handling fails on a busy computer.
- `cgroup_informer.py` records each process start with its parent and its cgroup. Docker gives
  every task's container a cgroup of its own, which is how accesses are tied to steps.

The logs stay in the run's folder, under `nwave_monitor/<run>/`, and go when that folder is
deleted. Clearing the run cache keeps them:

| File | What it holds |
| --- | --- |
| `file-bpf.csv` | One line per file access. |
| `cgroups.csv` | One line per process start. |
| `monitor.log` | The monitor's messages. |
| `monitor.json` | What N-WAVE recorded about the monitor: whether it ran, on which kernel, how many accesses, and the check for lost events. |

The run's log says when the monitor starts and what it recorded. The **Performance** tab says it
too.

### Lost events

The probes see every file access on the computer; the monitor keeps those under the run's
folder. When the computer is busy, its buffers can fill up, and then events are dropped without
a word; and the monitor sometimes records an open with the path of another one opened at the
same time. So after each run N-WAVE checks the files the run wrote: a file that has more bytes
on disk than the monitor saw written lost write events, or got them recorded under another
file. The run's log and the **Performance** tab then say for how many files, and that the views
of that run miss some accesses. (Files written
without `write()`, such as copies made with `copy_file_range`, aren't checked.)

The monitor can't be limited to the run's processes in the kernel on Docker Desktop: its
containers see other process ids than the kernel does, so the monitor's filter by process
can't find them.

## Switching it on

1. Build the monitor's image once, in the N-WAVE folder:
   `docker compose --profile monitor build iomonitor` (this compiles BCC and takes a while).
2. In **Global Settings → I/O monitor**, tick **Monitor file accesses during runs**. The section
   says whether the monitor can run on this computer, and why not.

An installation can fix the switch with `NWAVE_FEATURES="ioMonitor=on"` (or `off`), or never run
the monitor with `NWAVE_IO_MONITOR=off`. `NWAVE_IO_MONITOR_IMAGE` names another image.

## Privileges

The monitor's container is **privileged** and runs in the host's process namespace
(`--privileged --pid=host`): it loads code into the kernel and sees every process on the
computer, not only N-WAVE's. That is why it is off by default. Switch it on only on a computer
you control, and not on installations shared by several people.

## Where it works

What is known so far, from the tests and from reports. The monitor needs a Linux kernel with kprobes and eBPF, privileged containers, and the kernel's
headers. N-WAVE looks for the headers on the host (`/lib/modules`), then in the kernel itself
(`kheaders`), then installs the distribution's package.

| Platform | Tested | Result |
| --- | --- | --- |
| Windows, Docker Desktop with WSL 2 (kernel 6.18, Microsoft) | yes | Runs. There is no header package for this kernel; the kernel's own headers (`kheaders`) are used. On a busy computer it misses part of the accesses (on Demo 3, a quarter of the bytes the checked files were written with), and the run says so. |
| Linux with a distribution kernel | not yet | Expected to run: headers from the host or the distribution's package. A computer that does little else loses fewer events. |
| macOS, Docker Desktop | not yet | Unknown: Docker Desktop's virtual machine has its own kernel. |

Kernels from 6.13 on changed a structure the monitor reads (`struct file`); N-WAVE's image
applies a small patch for that (`backend/monitor/patches/`), which is offered back to the
authors.

When the monitor can't run (no kprobes, no headers, no privileges, no image), the run goes on
without it, and the run's log and **Performance** tab say why.
