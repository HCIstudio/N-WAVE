# The I/O monitor of Witzke et al. ("Low-level I/O Monitoring for Scientific
# Workflows", https://arxiv.org/abs/2408.00411), from their repository
# https://github.com/CRC-FONDA/workflow-monitoring at a pinned commit: their
# eBPF programs (bpf/fileaccess.py, bpf/cgroup_informer.py) with BCC built as
# their bpf/Dockerfile.24.04 does. N-WAVE adds only its entrypoint, and one
# patch for kernels from 6.13 on (patches/, offered back to the authors).
#
# Each release publishes it as hcistudio/nwave-iomonitor:<version>; N-WAVE
# downloads it when the monitor is switched on. To build it from this checkout:
#   docker compose --profile monitor build iomonitor   →   nwave-iomonitor:dev

# BCC, built as in their Dockerfile.24.04. Its library has LLVM and Clang in
# it, so the image below needs none of the build tools.
FROM ubuntu:24.04 AS bcc
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates git zip bison build-essential cmake flex libedit-dev \
      libllvm18 llvm-18-dev libclang-18-dev python3 zlib1g-dev libelf-dev libfl-dev \
      python3-setuptools liblzma-dev libdebuginfod-dev libpolly-18-dev \
 && rm -rf /var/lib/apt/lists/*
RUN git clone -b v0.35.0 --single-branch --depth 1 https://github.com/iovisor/bcc.git /bcc \
 && mkdir /bcc/build && cd /bcc/build \
 && cmake .. && make -j"$(nproc)" && make install \
 && cmake -DPYTHON_CMD=python3 .. && cd src/python && make && make install \
 && mkdir -p /bcc-runtime/lib /bcc-runtime/python \
 && cp -a /usr/lib/"$(gcc -dumpmachine)"/libbcc.so* /usr/lib/"$(gcc -dumpmachine)"/libbcc_bpf.so* /bcc-runtime/lib/ \
 && python3 -m zipfile -e /usr/lib/python3/dist-packages/bcc-*.egg /tmp/bcc-egg \
 && cp -a /tmp/bcc-egg/bcc /bcc-runtime/python/

# Their code, unchanged but for the patches.
ARG WORKFLOW_MONITORING_COMMIT=757342ce29c580bbb585a601fc939357c3d31ca1
RUN git clone https://github.com/CRC-FONDA/workflow-monitoring.git /workflow-monitoring \
 && cd /workflow-monitoring && git checkout "$WORKFLOW_MONITORING_COMMIT" \
 && mkdir /bpf && cp -r bpf/fileaccess.py bpf/cgroup_informer.py bpf/testdir /bpf/ \
 && git log -1 --format='%H %s' > /bpf/UPSTREAM_COMMIT
COPY patches/ /patches/
RUN cd /bpf && for patch in /patches/*.patch; do patch -p1 < "$patch"; done

# What runs: Python, BCC's libraries, kmod and xz for the kernel's own headers
# (kheaders), and apt for the distribution's header package.
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates python3 libelf1t64 libdebuginfod1t64 kmod xz-utils \
 && rm -rf /var/lib/apt/lists/*
COPY --from=bcc /bcc-runtime/lib/ /usr/local/lib/
COPY --from=bcc /bcc-runtime/python/bcc/ /usr/lib/python3/dist-packages/bcc/
RUN ldconfig && python3 -c "import bcc"
COPY --from=bcc /bpf/ /bpf/

COPY nwave-monitor.sh /nwave-monitor.sh
RUN chmod +x /nwave-monitor.sh
WORKDIR /bpf
ENTRYPOINT ["/nwave-monitor.sh"]
