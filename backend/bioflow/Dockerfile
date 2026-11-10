# The image N-WAVE runs to analyse a workflow with BioFlow-Insight
# (Marchment et al., 2024, https://doi.org/10.1093/nargab/lqae092).
#
#   docker build -t n-wave-bioflow backend/bioflow
#   docker run --rm --network none --read-only --tmpfs /tmp \
#     -v "$PWD/project:/project:ro" n-wave-bioflow /project
#
# It prints N-WAVE's JSON (see README.md) and needs no network: the package,
# its dependencies and Nextflow's language server (bundled in the package)
# are all in the image. Updates: see UPDATING.md.

# Python 3.12: the newest Python bioflow-insight's numpy~=1.26 installs on.
FROM python:3.12-slim-bookworm@sha256:935c3c5b12357a7e10caa9c1e6ca5692344d97cf229832ef584be2cec9fc03df

# Java runs the language server BioFlow-Insight bundles (built for Java 17);
# Graphviz is a dependency of the package.
# (The JRE's installer needs the man folder, which slim images leave out.)
RUN mkdir -p /usr/share/man/man1 \
    && apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jre-headless graphviz \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/bioflow

# Every package pinned and checked against its hash.
COPY requirements.txt ./
RUN pip install --no-cache-dir --no-deps --require-hashes -r requirements.txt

# The language server jar inside the package is checked too: a new version of
# the package with a different jar fails here until UPDATING.md's checks are
# done and language-server.sha256 is updated.
COPY language-server.sha256 ./
RUN jar="$(python -c 'import importlib.resources as r; print(r.files("src.language_server_source_code") / "language-server-all.jar")')" \
    && echo "$(cat language-server.sha256)  $jar" | sha256sum -c -

COPY analyse.py ./

# No root, no bytecode written at run time, a home folder in /tmp (the
# container's file system is read-only when N-WAVE runs it).
RUN useradd --system --uid 10001 --no-create-home bioflow
USER bioflow
ENV PYTHONDONTWRITEBYTECODE=1 \
    HOME=/tmp

ENTRYPOINT ["python", "-I", "/opt/bioflow/analyse.py"]
