"""Make the repository-local package importable without installation."""

from pathlib import Path
import sys

_ROOT = Path(__file__).resolve().parents[2]
_SRC = _ROOT / "packages" / "engineering_knowledge" / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))