"""CLI for retrieving context and proposing review-gated engineering learnings."""

from __future__ import annotations

import argparse
import asyncio
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Sequence

from .store import (
    AcceptedLearningAdapter,
    GraphifyCodeAdapter,
    KnowledgeRequest,
    KnowledgeStore,
    MarkdownWikiAdapter,
)

DEFAULT_PROJECT_ID = "focuskid"
KNOWLEDGE_TYPES = ("wiki", "learning", "code")


def build_store(project_root: str | Path) -> KnowledgeStore:
    """Build retrieval adapters rooted at the checked-out ERP repository."""
    return KnowledgeStore([
        MarkdownWikiAdapter(DEFAULT_PROJECT_ID, project_root),
        AcceptedLearningAdapter(DEFAULT_PROJECT_ID, project_root),
        GraphifyCodeAdapter(DEFAULT_PROJECT_ID, project_root),
    ])


def repository_root() -> Path:
    return Path(__file__).resolve().parents[4]


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="focuskid-knowledge",
        description="Retrieve context or propose a review-gated learning in this FocusKid checkout.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    retrieve = subparsers.add_parser("retrieve", help="print source-attributed context as JSON")
    retrieve.add_argument("query", help="the engineering question to look up")
    retrieve.add_argument("--changed-path", action="append", default=[], help="changed repository path (repeatable)")
    retrieve.add_argument("--knowledge-type", choices=KNOWLEDGE_TYPES, action="append")
    retrieve.add_argument("--limit", type=int, default=8)
    retrieve.add_argument("--max-context-chars", type=int, default=12_000)
    retrieve.add_argument("--role", default="engineering-agent")
    retrieve.add_argument(
        "--error-signature",
        help="concise, sanitized exception or failing assertion (omit payloads and personal data)",
    )

    propose = subparsers.add_parser(
        "propose-learning",
        help="write an evidence-backed learning candidate; candidates are never retrieved as policy",
    )
    propose.add_argument("--learning-id", required=True, help="stable lower-case slug")
    propose.add_argument("--title", required=True)
    propose.add_argument("--symptom", required=True)
    propose.add_argument("--cause", required=True)
    propose.add_argument("--resolution", required=True)
    propose.add_argument("--evidence", required=True, help="verification performed and result")
    propose.add_argument(
        "--source-ref", action="append", required=True,
        help="repository-relative code/test/Wiki/ADR path, optionally with #Lline or #Lstart-Lend",
    )
    return parser


async def _retrieve(args: argparse.Namespace, root: Path) -> dict[str, object]:
    error_signature = (args.error_signature or "").strip() or None
    request = KnowledgeRequest(
        project_id=DEFAULT_PROJECT_ID,
        query=args.query.strip(),
        role=args.role,
        knowledge_types=tuple(args.knowledge_type or KNOWLEDGE_TYPES),
        changed_paths=tuple(args.changed_path),
        limit=args.limit,
        max_context_chars=args.max_context_chars,
        error_signature=error_signature,
    )
    return (await build_store(root).retrieve(request)).to_dict()


def _candidate_source_ref(root: Path, value: str) -> str:
    source_ref = value.strip().replace("\\", "/")
    source_path, separator, fragment = source_ref.partition("#")
    path = Path(source_path)
    if (
        not source_path
        or source_path.startswith("/")
        or re.match(r"^[a-zA-Z]:/", source_path)
        or path.is_absolute()
        or ".." in path.parts
    ):
        raise ValueError(f"source reference must be a safe repository-relative path: {value}")
    if separator:
        line_match = re.fullmatch(r"L(\d+)(?:-L(\d+))?", fragment)
        if not line_match or (line_match.group(2) and int(line_match.group(2)) < int(line_match.group(1))):
            raise ValueError(f"source reference line fragment must look like #L12 or #L12-L18: {value}")
    sensitive_parts = {".env", "secrets", "fixtures", "fixture", "seed", "uploads", "customer-data", "production"}
    if any(
        part.lower() in sensitive_parts or part.lower().startswith(".env")
        for part in path.parts
    ):
        raise ValueError(f"source reference points into an excluded data path: {value}")
    code_suffixes = {".py", ".sh", ".ts", ".tsx", ".js", ".jsx", ".sql"}
    is_wiki_markdown = source_path.startswith("docs/wiki/") and path.suffix.lower() == ".md"
    if path.suffix.lower() not in code_suffixes and not is_wiki_markdown:
        raise ValueError(f"source reference must target code, tests, or Wiki/ADR Markdown: {value}")
    resolved_root = root.resolve()
    resolved_path = (resolved_root / path).resolve()
    try:
        resolved_path.relative_to(resolved_root)
    except ValueError as error:
        raise ValueError(f"source reference escapes the repository: {value}") from error
    if not resolved_path.is_file():
        raise ValueError(f"source reference does not exist in this checkout: {value}")
    if any(
        part.lower() in sensitive_parts or part.lower().startswith(".env")
        for part in resolved_path.relative_to(resolved_root).parts
    ):
        raise ValueError(f"source reference resolves into an excluded data path: {value}")
    return source_path + (f"#{fragment}" if separator else "")


def _propose_learning(args: argparse.Namespace, root: Path) -> dict[str, str]:
    learning_id = args.learning_id.strip()
    if not re.fullmatch(r"[a-z0-9]+(?:[-_][a-z0-9]+)*", learning_id):
        raise ValueError("learning-id must be a lower-case alphanumeric slug")
    values = {
        "title": " ".join(args.title.split()),
        "symptom": args.symptom.strip(),
        "cause": args.cause.strip(),
        "resolution": args.resolution.strip(),
        "evidence": args.evidence.strip(),
    }
    if any(not value for value in values.values()):
        raise ValueError("title, symptom, cause, resolution, and evidence are required")
    max_lengths = {
        "title": 160,
        "symptom": 2_000,
        "cause": 2_000,
        "resolution": 3_000,
        "evidence": 2_000,
    }
    for name, value in values.items():
        if "\x00" in value or len(value) > max_lengths[name]:
            raise ValueError(f"{name} must be at most {max_lengths[name]} characters and contain no NUL bytes")

    source_refs = list(dict.fromkeys(_candidate_source_ref(root, item) for item in args.source_ref))
    if len(source_refs) > 12:
        raise ValueError("a learning candidate may contain no more than 12 source references")
    resolved_root = root.resolve()
    target_dir = (resolved_root / "docs" / "wiki" / "patterns").resolve()
    try:
        target_dir.relative_to(resolved_root)
    except ValueError as error:
        raise ValueError("the repository learning-record directory escapes the checkout") from error
    if not target_dir.is_dir():
        raise ValueError("the repository learning-record directory is missing")
    target = target_dir / f"{learning_id}.md"
    quoted_refs = "\n".join(
        f"  - {json.dumps(source_ref, ensure_ascii=False)}" for source_ref in source_refs
    )
    content = (
        "---\n"
        "knowledge_type: learning\n"
        "knowledge_status: candidate\n"
        f"learning_id: {json.dumps(learning_id)}\n"
        f"created_at: {datetime.now(timezone.utc).date().isoformat()}\n"
        "source_refs:\n"
        f"{quoted_refs}\n"
        "reviewed_by:\n"
        "reviewed_at:\n"
        "decision_reason:\n"
        "supersedes:\n"
        "---\n\n"
        f"# {values['title']}\n\n"
        f"## Symptom\n\n{values['symptom']}\n\n"
        f"## Cause\n\n{values['cause']}\n\n"
        f"## Resolution\n\n{values['resolution']}\n\n"
        f"## Evidence\n\n{values['evidence']}\n"
    )
    try:
        with target.open("x", encoding="utf-8") as output:
            output.write(content)
    except FileExistsError as error:
        raise ValueError(f"learning record already exists: {target.relative_to(root)}") from error
    return {
        "status": "candidate",
        "path": target.relative_to(resolved_root).as_posix(),
        "message": "Created a candidate record. It is excluded from retrieval until a human review is recorded.",
    }


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == "propose-learning":
            payload = _propose_learning(args, repository_root())
        else:
            payload = asyncio.run(_retrieve(args, repository_root()))
    except ValueError as error:
        _parser().error(str(error))
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
