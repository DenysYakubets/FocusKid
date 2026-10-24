"""Deterministic golden queries for the local Engineering Knowledge retrieval contract."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from engineering_knowledge import KnowledgeRequest
from engineering_knowledge.cli import DEFAULT_PROJECT_ID, build_store

GOLDEN_CASES = json.loads(
    Path(__file__).with_name("golden_queries.json").read_text(encoding="utf-8")
)
SECTION_BY_TYPE = {
    "learning": "patterns",
    "wiki": "knowledge",
    "code": "graphify",
}


def _write(root: Path, relative_path: str, content: str) -> None:
    path = root / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _seed_checkout(root: Path) -> None:
    _write(
        root,
        "docs/wiki/timer-fsm.md",
        "# Timer FSM\n\n"
        "The child stop dialog ends a session as abandoned; parent PIN verification "
        "promotes Completed to Verified.\n",
    )
    _write(
        root,
        "docs/wiki/failure-signatures.md",
        "# Failure signatures\n\n"
        "SESSION_LIMIT_REACHED_TODAY is returned when today's runs reach target_per_day.\n",
    )
    _write(
        root,
        "docs/wiki/patterns/route-session-today-only.md",
        "---\n"
        "knowledge_type: learning\n"
        "knowledge_status: accepted\n"
        "learning_id: route-session-today-only\n"
        "reviewed_by: engineering-maintainer\n"
        "reviewed_at: 2026-10-24\n"
        "source_refs:\n"
        '  - "src/screens/TimerScreen.tsx#L66"\n'
        "---\n\n"
        "# Drive the timer display from today's session only\n\n"
        "The route session refresh ignores prior-day rows so the Timer screen keeps "
        "an explicit start action.\n",
    )

    _write(root, "src/screens/TimerScreen.tsx", "export function TimerScreen() {}\n")
    _write(root, "src/services/timer/timerService.ts", "export function createTimerService() {}\n")
    _write(
        root,
        "src/screens/__tests__/timerReadyToday.test.tsx",
        "it('shows start when today is free', () => {});\n",
    )
    graph = {
        "built_at_commit": None,
        "nodes": [
            {
                "id": "timer_service",
                "label": "createTimerService",
                "source_file": "src/services/timer/timerService.ts",
                "source_location": "L85",
                "community_name": "timer service",
            },
            {
                "id": "timer_screen",
                "label": "TimerScreen",
                "source_file": "src/screens/TimerScreen.tsx",
                "source_location": "L30",
            },
            {
                "id": "timer_ready_test",
                "label": "timerReadyToday.test",
                "source_file": "src/screens/__tests__/timerReadyToday.test.tsx",
                "source_location": "L1",
            },
        ],
        "links": [
            {
                "relation": "calls",
                "source": "timer_screen",
                "target": "timer_service",
                "source_file": "src/screens/TimerScreen.tsx",
                "source_location": "L16",
            },
            {
                "relation": "calls",
                "source": "timer_ready_test",
                "target": "timer_service",
                "source_file": "src/screens/__tests__/timerReadyToday.test.tsx",
                "source_location": "L10",
            },
        ],
    }
    graph_path = root / "graphify-out" / "graph.json"
    graph_path.parent.mkdir(parents=True, exist_ok=True)
    graph_path.write_text(json.dumps(graph), encoding="utf-8")


@pytest.fixture
def knowledge_checkout(tmp_path: Path) -> Path:
    _seed_checkout(tmp_path)
    return tmp_path


@pytest.mark.parametrize("golden_case", GOLDEN_CASES, ids=lambda case: case["id"])
def test_golden_query_returns_expected_sources(
    knowledge_checkout: Path, golden_case: dict[str, object]
) -> None:
    request = KnowledgeRequest(
        project_id=DEFAULT_PROJECT_ID,
        query=str(golden_case["query"]),
        error_signature=golden_case.get("error_signature"),
        changed_paths=tuple(golden_case.get("changed_paths", ())),
        knowledge_types=tuple(golden_case["knowledge_types"]),
    )

    response = asyncio.run(build_store(knowledge_checkout).retrieve(request))
    by_source = {
        result.source_ref.split("#", 1)[0]: result
        for result in response.results
    }

    for expected_source in golden_case["expected_sources"]:
        assert expected_source in by_source, (
            f"Golden query {golden_case['id']} did not retrieve {expected_source}; "
            f"got {sorted(by_source)}; degraded={response.degraded_sources}"
        )

    if "error_signature" in golden_case:
        assert response.error_signature == golden_case["error_signature"]

    expected_provenance = golden_case.get("expected_provenance", {})
    for key, value in expected_provenance.items():
        assert by_source[golden_case["expected_sources"][0]].provenance[key] == value

    expected_related_refs = golden_case.get("expected_related_refs", {})
    if expected_related_refs:
        result = by_source[golden_case["expected_sources"][0]]
        for relationship, refs in expected_related_refs.items():
            assert set(refs).issubset(result.provenance["related_refs"][relationship])

    serialized = response.to_dict()
    assert "results" not in serialized
    sections = serialized["sections"]
    assert set(sections) == {"patterns", "knowledge", "graphify"}
    for knowledge_type in golden_case["knowledge_types"]:
        section = SECTION_BY_TYPE[knowledge_type]
        for result in response.results:
            if result.knowledge_type == knowledge_type:
                assert result.to_dict() in sections[section]

    expected_sections = golden_case.get("expected_sections", {})
    for section, expected_sources in expected_sections.items():
        actual_sources = {
            result["source_ref"].split("#", 1)[0]
            for result in sections[section]
        }
        assert set(expected_sources).issubset(actual_sources), (
            f"Golden query {golden_case['id']} expected section {section} to include "
            f"{expected_sources}; got {sorted(actual_sources)}"
        )