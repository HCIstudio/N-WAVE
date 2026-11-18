# BottleMod's code (https://github.com/bottlemod/bottlemod) at a pinned commit,
# with its modified SciPy 1.15.1, built against the versions of that time
# (their Dockerfile's unpinned conda env no longer compiles).
FROM python:3.12-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends gfortran libopenblas-dev pkg-config git && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir numpy==2.2.2 cython==3.0.11 pythran==0.17.0 pybind11==2.13.6 meson-python==0.17.1 meson==1.6.1 ninja==1.11.1.3
ARG BOTTLEMOD_COMMIT=05f2a6dcda5c96fe6794b89a4669f6fb0c0ec34a
RUN git clone https://github.com/bottlemod/bottlemod.git /bottlemod-src \
 && cd /bottlemod-src && git checkout "$BOTTLEMOD_COMMIT" \
 && mkdir /bottlemod && cp func.py ppoly.py task.py /bottlemod/ \
 && git log -1 --format='%H %s' > /bottlemod/UPSTREAM_COMMIT
RUN git clone --depth 1 --branch v1.15.1 https://github.com/scipy/scipy.git /scipy && cd /scipy && git submodule update --init --depth 1
RUN cp /bottlemod-src/custom_scipy/_ppoly_v1.15.1.pyx /scipy/scipy/interpolate/_ppoly.pyx
RUN cd /scipy && pip install --no-cache-dir --no-build-isolation -v . > /tmp/scipy-build.log 2>&1 || (tail -50 /tmp/scipy-build.log; exit 1)
WORKDIR /bottlemod
