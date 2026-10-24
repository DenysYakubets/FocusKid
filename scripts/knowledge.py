#!/usr/bin/env python3
"""Run the repository-local engineering knowledge CLI without installation."""

from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parents[1]
PACKAGE_SOURCE = REPO_ROOT / "packages" / "engineering_knowledge" / "src"
sys.path.insert(0, str(PACKAGE_SOURCE))

from engineering_knowledge.cli import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
