"""Contract tests: analyse.py's output for each project in tests/projects/
must equal the recorded tests/expected/<project>.json, byte for byte.

    python -I tests/contract.py            # compare, exit 1 on any difference
    python -I tests/contract.py --update   # record the current output

They run in the analysis image (see the CI workflow), so a new version of
BioFlow-Insight that changes anything N-WAVE reads fails here. Before
recording new outputs, follow UPDATING.md.
"""

from __future__ import annotations

import argparse
import difflib
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ANALYSE = HERE.parent / "analyse.py"


def analyse(project: Path) -> str:
    # One process per project: BioFlow-Insight keeps state (and a JVM) per process.
    result = subprocess.run(
        [sys.executable, "-I", str(ANALYSE), str(project)],
        capture_output=True,
        text=True,
        timeout=300,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"analyse.py failed on {project.name}:\n{result.stderr[-2000:]}")
    return result.stdout


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--update", action="store_true", help="record the current output")
    parser.add_argument("--expected", type=Path, default=HERE / "expected", help="where the recorded outputs are")
    args = parser.parse_args()

    projects = sorted(path for path in (HERE / "projects").iterdir() if path.is_dir())
    failed = 0
    for project in projects:
        output = analyse(project)
        expected_file = args.expected / f"{project.name}.json"
        if args.update:
            args.expected.mkdir(parents=True, exist_ok=True)
            expected_file.write_text(output)
            print(f"recorded {project.name}")
            continue
        expected = expected_file.read_text() if expected_file.exists() else ""
        if output == expected:
            print(f"ok       {project.name}")
            continue
        failed += 1
        print(f"CHANGED  {project.name}")
        sys.stdout.writelines(
            difflib.unified_diff(
                expected.splitlines(keepends=True),
                output.splitlines(keepends=True),
                fromfile=f"expected/{project.name}.json",
                tofile=f"output/{project.name}.json",
            )
        )
    if failed:
        print(f"\n{failed} of {len(projects)} outputs changed. See backend/bioflow/UPDATING.md.")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
