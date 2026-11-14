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

## Which step made an access

The monitor records processes and files, not steps. N-WAVE links each access to the task, and so
to the node on the canvas, with the method of Witzke et al. (section 5 of their paper):

1. Each task's work directory is in Nextflow's log, which N-WAVE already reads to show a run's
   tasks.
2. The task's first process is the one that opens the task's `.command.sh` for reading.
3. Docker gives each task's container its own cgroup, so all processes of the task share that
   process's cgroup. The monitor's process log (`cgroups.csv`) records the cgroup of every
   process that starts a new one.
4. Every access by a process in that cgroup belongs to the task; the task belongs to the node
   that runs its process.

N-WAVE adds two things, because on a busy computer the monitor loses or mislabels some opens:

- Besides `.command.sh`, it counts the task's other bookkeeping files opened in its directory
  (`.command.run`, `.command.out`, `.command.trace`, `.exitcode` and the like), but not
  Nextflow's writing of `.command.sh` and `.command.run`. `.command.sh` or `.command.run` read by
  a process counts ten times. The strongest task and cgroup go together first, each once.
- A cgroup that would win several tasks is Nextflow's own container, one with less than half
  of its opens in one task's directory isn't a task's, and one there from the monitor's start
  is the computer's own (a task's container is made during the run): all are left out. So tasks that
  ran without a container of their own (Nextflow runs them in its own when a step has no
  container) can't be told apart, and aren't linked.
- A process's cgroup comes from the processes it starts itself where it starts any: a
  container's first process is started outside the container's cgroup and moved into it.
- A read or write belongs to the file its handle was last opened for: the monitor's file and
  handle ids repeat on a busy computer.

Accesses that can't be linked are counted, not dropped. The **Performance** tab says how many,
and why: by processes outside the steps' containers (Nextflow itself, Docker), by processes that
started before the monitor, or to files whose opening the monitor didn't record.

On Demo 1 and Demo 3 recorded on Docker Desktop (WSL 2), every task was linked to a cgroup of its
own (5 of 5 and 42 of 42). A workflow whose steps had no container linked none, and none wrongly.

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
