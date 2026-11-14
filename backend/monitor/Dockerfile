# The I/O monitor of Witzke et al. ("Low-level I/O Monitoring for Scientific
# Workflows", https://arxiv.org/abs/2408.00411), from their repository
# https://github.com/CRC-FONDA/workflow-monitoring at a pinned commit: their
# eBPF programs (bpf/fileaccess.py, bpf/cgroup_informer.py) with BCC built as
# their bpf/Dockerfile.24.04 does. N-WAVE adds only its entrypoint, and one
# patch for kernels from 6.13 on (patches/, offered back to the authors).
#
#   docker compose --profile monitor build iomonitor   →   nwave-iomonitor:dev

FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive

# BCC and its dependencies, as in their Dockerfile.24.04; kmod for kheaders.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git zip bison build-essential cmake flex libedit-dev \
      libllvm18 llvm-18-dev libclang-18-dev python3 zlib1g-dev libelf-dev libfl-dev \
      python3-setuptools liblzma-dev libdebuginfod-dev libpolly-18-dev kmod xz-utils \
 && rm -rf /var/lib/apt/lists/*
RUN git clone -b v0.35.0 --single-branch --depth 1 https://github.com/iovisor/bcc.git /bcc \
 && mkdir /bcc/build && cd /bcc/build \
 && cmake .. && make -j"$(nproc)" && make install \
 && cmake -DPYTHON_CMD=python3 .. && cd src/python && make && make install \
 && rm -rf /bcc

# Their code, unchanged but for the patches.
ARG WORKFLOW_MONITORING_COMMIT=757342ce29c580bbb585a601fc939357c3d31ca1
RUN git clone https://github.com/CRC-FONDA/workflow-monitoring.git /workflow-monitoring \
 && cd /workflow-monitoring && git checkout "$WORKFLOW_MONITORING_COMMIT" \
 && mkdir /bpf && cp -r bpf/fileaccess.py bpf/cgroup_informer.py bpf/testdir /bpf/ \
 && git log -1 --format='%H %s' > /bpf/UPSTREAM_COMMIT
COPY patches/ /patches/
RUN cd /bpf && for patch in /patches/*.patch; do patch -p1 < "$patch"; done

COPY nwave-monitor.sh /nwave-monitor.sh
RUN chmod +x /nwave-monitor.sh
WORKDIR /bpf
ENTRYPOINT ["/nwave-monitor.sh"]
