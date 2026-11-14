#!/bin/bash
# N-WAVE's entrypoint for the I/O monitor of Witzke et al.: records the file
# accesses under one run's folder while the run goes.
#
#   nwave-monitor.sh <results mount point> <run folder, relative to it> <output folder, relative to it>
#
# It prints one line for N-WAVE, then runs until it gets SIGINT or SIGTERM:
#   NWAVE-MONITOR ready <kernel>          both tracers are attached
#   NWAVE-MONITOR unavailable <reason>    it can't run here (and exits 3)
# Its logs: file-bpf.csv (file accesses) and cgroups.csv (process starts
# with their cgroup), and their messages in monitor.log.

set -u
MOUNT=${1:?results mount point}
RUN_REL=${2:?run folder}
OUT_REL=${3:?output folder}
OUT="$MOUNT/$OUT_REL"
mkdir -p "$OUT"
LOG="$OUT/monitor.log"
: > "$LOG"

unavailable() {
  echo "NWAVE-MONITOR unavailable $1"
  echo "unavailable: $1" >> "$LOG"
  exit 3
}

KERNEL=$(uname -r)
[ -d /sys/kernel/tracing ] || [ -d /sys/kernel/debug ] || unavailable "the kernel has no tracing file system"
mountpoint -q /sys/kernel/debug || mount -t debugfs none /sys/kernel/debug >> "$LOG" 2>&1 \
  || unavailable "debugfs can't be mounted (the container needs --privileged)"
grep -qw vfs_read /proc/kallsyms 2>/dev/null || unavailable "the kernel doesn't list vfs_read (no kprobes, or no privileges)"

# Kernel headers, which BCC compiles the probes against: the host's, else the
# kernel's own (kheaders), else the distribution's package (as their
# entrypoint does). WSL 2 and Docker Desktop kernels have no package.
if [ ! -e "/lib/modules/$KERNEL/build/include" ] && [ ! -e /sys/kernel/kheaders.tar.xz ]; then
  modprobe kheaders >> "$LOG" 2>&1 || true
  if [ ! -e /sys/kernel/kheaders.tar.xz ]; then
    (apt-get update && apt-get install -y "linux-headers-$KERNEL") >> "$LOG" 2>&1 || true
  fi
fi
if [ ! -e "/lib/modules/$KERNEL/build/include" ] && [ ! -e /sys/kernel/kheaders.tar.xz ]; then
  unavailable "no kernel headers for $KERNEL (no package, and the kernel has no kheaders module)"
fi

# Where the run's folder is as the kernel names it: from the root of the
# file system that holds it (their path filter compares those paths).
ROOT=$(awk -v mp="$MOUNT" '$5 == mp { print $4; exit }' /proc/self/mountinfo | sed 's/\\040/ /g')
[ -n "$ROOT" ] || unavailable "the results folder isn't mounted at $MOUNT"
PREFIX="${ROOT%/}/$RUN_REL"
[ "$ROOT" = "/" ] && PREFIX="/$RUN_REL"
# The path depth the probes record: the run's folder and up to 8 folders below it
# (work/xx/hash/… and published results); deeper paths lose their start.
DEPTH=$(( $(echo "$PREFIX" | tr -cd '/' | wc -c) + 8 ))
echo "prefix: $PREFIX (depth $DEPTH)" >> "$LOG"

# Their ring buffers (the paper's setup), large: the probes see every file
# access on the computer and their Python keeps only the run's. Deletes
# aren't recorded: their handling of them fails on a busy system.
# Each line goes to the log as it is printed (python -u, standard output),
# so stopping them loses nothing that was printed.
python3 -u cgroup_informer.py --evbufmain 1024 > "$OUT/cgroups.csv" 2>> "$LOG" &
CGROUPS=$!
python3 -u fileaccess.py --nofilter -o OCRW -P "$PREFIX" --usermodepathfilter \
  --depth "$DEPTH" --bufsize 128 --pathoutput 1024 --evbufmain 4096 --evbufpath 8192 \
  > "$OUT/file-bpf.csv" 2>> "$LOG" &
FILES=$!

stop() {
  # Events still in the buffers are handled first.
  sleep 2
  kill -TERM "$FILES" "$CGROUPS" 2>/dev/null
  wait "$FILES" "$CGROUPS" 2>/dev/null
  echo "stopped" >> "$LOG"
  exit 0
}
trap stop INT TERM

# Ready once fileaccess.py has compiled its probes and attaches them (it
# says so on stderr), and cgroup_informer.py runs.
for _ in $(seq 1 360); do
  if ! kill -0 "$FILES" 2>/dev/null || ! kill -0 "$CGROUPS" 2>/dev/null; then
    unavailable "the probes didn't load: $(grep -E 'error|Error|Exception' "$LOG" | tail -n 1)"
  fi
  if grep -q "Attaching" "$LOG"; then
    sleep 2
    echo "NWAVE-MONITOR ready $KERNEL"
    break
  fi
  sleep 0.5
done
kill -0 "$FILES" 2>/dev/null || unavailable "the probes didn't load in time"
# Waits in the background, so the trap runs as soon as a signal comes.
wait "$FILES"
