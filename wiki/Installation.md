N-WAVE runs in your browser. To try it without installing anything, open the
[browser demo](https://hcistudio.github.io/N-WAVE/): you can build, edit and export
workflows there, but not run them. To run workflows, install N-WAVE with Docker.

## With Docker (recommended)

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows, macOS)
or Docker Engine (Linux), running.

1. Download `latest.yml` from the
   [latest release](https://github.com/HCIstudio/N-WAVE/releases/latest).
2. In a terminal, in the folder with `latest.yml`, start N-WAVE:
   ```bash
   docker compose -f latest.yml up -d
   ```
3. Open <http://localhost:5173>.

The first start downloads the images, and the first run also downloads Nextflow (see
[Troubleshooting: the first run is slow](https://github.com/HCIstudio/N-WAVE/wiki/Troubleshooting#the-first-run-is-slow)).

| To | Run |
| --- | --- |
| Stop N-WAVE | `docker compose -f latest.yml stop` |
| Start it again | `docker compose -f latest.yml up -d` |
| Update to the latest release | download the new `latest.yml`, then `docker compose -f latest.yml pull` and `docker compose -f latest.yml up -d` |
| Remove N-WAVE and its saved workflows | `docker compose -f latest.yml down -v` |

### Where your data is

- **Workflows** are stored in the `mongodb_data` Docker volume (removed by `down -v`).
- **Run results** are written to `results/` next to `latest.yml`, one folder per run (see
  [Running workflows](https://github.com/HCIstudio/N-WAVE/wiki/Running-Workflows#where-the-results-are)).
- **Installed nf-core modules, custom nodes and node packs** are kept in `results/.nwave/`.

### Memory and CPUs

Runs get at most what Docker gives them. On Docker Desktop, open *Settings → Resources* and
give Docker enough memory: 8 GB for the examples, much more for real genomes. See
[Running workflows: resources](https://github.com/HCIstudio/N-WAVE/wiki/Running-Workflows#resources-and-time-limits).

## Who can reach N-WAVE

Only this computer: the ports are bound to `127.0.0.1`. N-WAVE has no login, and it starts
containers through the computer's Docker, so anyone who can reach it can run code on that
computer. Open it to a network only if you trust everyone on it:

```bash
NWAVE_BIND_ADDRESS=0.0.0.0 docker compose -f latest.yml up -d
```

Then add the address people open (for example `http://192.168.1.20:5173`) to `CORS_ORIGIN`
in `latest.yml`. See [Security](https://github.com/HCIstudio/N-WAVE#security).

## From source

For development, or to build the images yourself, clone the repository and follow
[Running N-WAVE from source](https://github.com/HCIstudio/N-WAVE#from-source) in the
README; [CONTRIBUTING.md](https://github.com/HCIstudio/N-WAVE/blob/main/CONTRIBUTING.md) has the
development setup. All settings (ports, limits, where Nextflow runs) are listed under
[Configuration](https://github.com/HCIstudio/N-WAVE#configuration).

## Next

[Your first workflow in 10 minutes](https://github.com/HCIstudio/N-WAVE/wiki/First-Workflow).
