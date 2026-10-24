from __future__ import annotations

from argparse import Namespace
from pathlib import Path

import pytest

from engineering_knowledge.cli import _candidate_source_ref, _propose_learning
from engineering_knowledge.store import _front_matter


def _candidate_args(source_ref: str) -> Namespace:
    return Namespace(
        learning_id="daily-limit-unique-index",
        title="Drop the task/day unique index for N-per-day runs",
        symptom="The second session of the day fails on a unique constraint.",
        cause="A partial UNIQUE index can only express one row per task/day.",
        resolution="Drop the index in a migration and enforce the cap in the service layer.",
        evidence="Migration and daily-limit suites pass after the V5 change.",
        source_ref=[source_ref],
    )


def test_propose_learning_writes_candidate_with_review_gate(tmp_path: Path) -> None:
    patterns = tmp_path / "docs" / "wiki" / "patterns"
    patterns.mkdir(parents=True)
    source = tmp_path / "src" / "services" / "timer" / "timerService.ts"
    source.parent.mkdir(parents=True)
    source.write_text("export function createTimerService() {}\n", encoding="utf-8")

    result = _propose_learning(
        _candidate_args("src/services/timer/timerService.ts#L141"), tmp_path
    )

    candidate = tmp_path / result["path"]
    metadata, body, _ = _front_matter(candidate.read_text(encoding="utf-8"))
    assert result["status"] == "candidate"
    assert metadata["knowledge_status"] == "candidate"
    assert metadata["reviewed_by"] == []
    assert metadata["source_refs"] == ["src/services/timer/timerService.ts#L141"]
    assert "## Evidence" in body


def test_candidate_source_reference_rejects_repository_escape(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="safe repository-relative path"):
        _candidate_source_ref(tmp_path, "../outside.ts")


def test_candidate_source_reference_rejects_missing_file(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="does not exist in this checkout"):
        _candidate_source_ref(tmp_path, "src/does/not/exist.ts")


def test_candidate_source_reference_rejects_non_code_markdown(tmp_path: Path) -> None:
    readme = tmp_path / "README.md"
    readme.write_text("# repo\n", encoding="utf-8")
    with pytest.raises(ValueError, match="code, tests, or Wiki/ADR Markdown"):
        _candidate_source_ref(tmp_path, "README.md")