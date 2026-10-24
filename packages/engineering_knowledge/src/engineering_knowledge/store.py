"""Source-attributed, project-scoped knowledge contracts and file adapters."""

from __future__ import annotations

import hashlib
import inspect
import json
import re
import subprocess
from dataclasses import asdict, dataclass, field, replace
from pathlib import Path
from typing import Any, Protocol


@dataclass(frozen=True)
class KnowledgeRequest:
    project_id: str
    query: str
    role: str = "engineering-agent"
    knowledge_types: tuple[str, ...] = ("wiki", "learning", "code")
    changed_paths: tuple[str, ...] = ()
    limit: int = 8
    max_context_chars: int = 12_000
    error_signature: str | None = None

    def __post_init__(self) -> None:
        if not self.project_id.strip():
            raise ValueError("project_id is required")
        if not self.query.strip():
            raise ValueError("query is required")
        if self.error_signature is not None and (
            not self.error_signature.strip() or len(self.error_signature) > 2_000
        ):
            raise ValueError("error_signature must be non-empty and at most 2000 characters")
        if not 1 <= self.limit <= 25:
            raise ValueError("limit must be between 1 and 25")
        if not 256 <= self.max_context_chars <= 50_000:
            raise ValueError("max_context_chars must be between 256 and 50000")


@dataclass(frozen=True)
class KnowledgeResult:
    knowledge_type: str
    content: str
    source_ref: str
    score: float
    provenance: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_SECTION_BY_KNOWLEDGE_TYPE = {
    "learning": "patterns",
    "wiki": "knowledge",
    "code": "graphify",
}
_SECTION_NAMES = ("patterns", "knowledge", "graphify")


def _section_payload(results: list[KnowledgeResult]) -> dict[str, list[dict[str, Any]]]:
    sections: dict[str, list[dict[str, Any]]] = {
        name: [] for name in _SECTION_NAMES
    }
    for result in results:
        section = _SECTION_BY_KNOWLEDGE_TYPE.get(result.knowledge_type)
        if section is None:
            raise ValueError(f"unsupported engineering knowledge type: {result.knowledge_type}")
        sections[section].append(result.to_dict())
    return sections


@dataclass
class KnowledgeResponse:
    project_id: str
    query: str
    results: list[KnowledgeResult] = field(default_factory=list)
    degraded_sources: list[str] = field(default_factory=list)
    context_chars: int = 0
    error_signature: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "project_id": self.project_id,
            "query": self.query,
            "error_signature": self.error_signature,
            "sections": _section_payload(self.results),
            "degraded_sources": list(self.degraded_sources),
            "context_chars": self.context_chars,
        }


class KnowledgeAdapter(Protocol):
    name: str
    knowledge_type: str

    def retrieve(self, request: KnowledgeRequest) -> Any: ...


def _require_scope(request: KnowledgeRequest, configured_project_id: str) -> None:
    if request.project_id != configured_project_id:
        raise ValueError("request project_id does not match adapter scope")


def _safe_file(root: Path, path: Path) -> bool:
    try:
        path.resolve().relative_to(root)
    except ValueError:
        return False
    return path.is_file()


def _git_commit(root: Path) -> str | None:
    try:
        return subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            check=True, capture_output=True, text=True, timeout=2,
        ).stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        return None


def _git_dirty(root: Path) -> bool:
    try:
        result = subprocess.run(
            ["git", "-C", str(root), "status", "--porcelain", "--untracked-files=all"],
            check=True, capture_output=True, text=True, timeout=2,
        )
        return bool(result.stdout.strip())
    except (OSError, subprocess.SubprocessError):
        return False


def _front_matter(content: str) -> tuple[dict[str, Any], str, int]:
    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, content, 1
    end = next((index for index in range(1, len(lines)) if lines[index].strip() == "---"), None)
    if end is None:
        return {}, content, 1
    metadata: dict[str, Any] = {}
    list_key: str | None = None
    for line in lines[1:end]:
        list_item = re.match(r"^\s+-\s+(.+?)\s*$", line)
        if list_item and list_key:
            metadata.setdefault(list_key, []).append(list_item.group(1).strip(" '\""))
            continue
        match = re.match(r"^([\w-]+):\s*(.*?)\s*$", line)
        if not match:
            list_key = None
            continue
        key, value = match.groups()
        value = value.strip(" '\"")
        if value:
            metadata[key] = value
            list_key = None
        else:
            metadata[key] = []
            list_key = key
    return metadata, "\n".join(lines[end + 1:]), end + 2


def _terms(text: str) -> set[str]:
    normalized = re.sub(r"[_/]+", " ", text.lower())
    return {term for term in re.findall(r"[\w.-]{3,}", normalized)}


def _search_text(request: KnowledgeRequest) -> str:
    return " ".join(
        part.strip() for part in (request.query, request.error_signature or "") if part.strip()
    )


def _normalize_repo_path(value: str) -> str:
    normalized = value.strip().replace("\\", "/")
    if normalized.startswith("/") or re.match(r"^[a-zA-Z]:/", normalized):
        return ""
    while normalized.startswith("./"):
        normalized = normalized[2:]
    parts = [part for part in normalized.split("/") if part not in {"", "."}]
    if ".." in parts:
        return ""
    return "/".join(parts).lower()


def _path_matches(source_ref: str, changed_path: str) -> bool:
    source_path = source_ref.split("#", 1)[0]
    source = _normalize_repo_path(source_path)
    changed = _normalize_repo_path(changed_path)
    if not source or not changed:
        return False
    return source == changed or source.startswith(changed + "/")


def _safe_graph_source(root: Path, source_file: str) -> bool:
    normalized = source_file.strip().replace("\\", "/")
    source_path = Path(normalized)
    return bool(
        normalized
        and _normalize_repo_path(normalized)
        and not source_path.is_absolute()
        and ".." not in source_path.parts
        and source_path.suffix.lower()
        in {".py", ".kt", ".kts", ".ts", ".tsx", ".js", ".jsx", ".sql"}
        and not any(
            part.lower() in {".env", "secrets", "fixtures", "seed", "uploads", "customer-data"}
            for part in source_path.parts
        )
        and _safe_file(root, root / source_path)
    )


def _is_test_source(source_file: str) -> bool:
    path = Path(source_file)
    name = path.name.lower()
    return any(part.lower() in {"test", "tests"} for part in path.parts) or (
        name.startswith("test_")
        or "_test." in name
        or ".test." in name
        or ".spec." in name
        or name.endswith("test.kt")
    )


def _score(content: str, query: str, changed_paths: tuple[str, ...] = ()) -> float:
    query_terms = _terms(query)
    content_terms = _terms(content)
    if not query_terms:
        return 0.0
    overlap = len(query_terms & content_terms) / len(query_terms)
    path_match = any(_path_matches(content, path) for path in changed_paths)
    return min(1.0, overlap + (0.35 if path_match else 0.0))


def _snippet(content: str, query: str, max_chars: int) -> tuple[str, int]:
    lines = content.splitlines()
    if not lines:
        return "", 1
    terms = _terms(query)
    best_index = max(
        range(len(lines)),
        key=lambda index: sum(term in lines[index].lower() for term in terms),
        default=0,
    )
    line_number = best_index + 1
    start = best_index
    end = best_index + 1
    size = len(lines[best_index])
    while start > 0 or end < len(lines):
        previous = len(lines[start - 1]) + 1 if start > 0 else max_chars + 1
        following = len(lines[end]) + 1 if end < len(lines) else max_chars + 1
        if size + min(previous, following) > max_chars:
            break
        if previous <= following:
            start -= 1
            size += previous
        else:
            size += following
            end += 1
    return "\n".join(lines[start:end])[:max_chars], line_number


class MarkdownWikiAdapter:
    name = "project-wiki"
    knowledge_type = "wiki"

    _source_groups = (
        (Path("docs/wiki"), "*.md", "canonical-wiki"),
    )

    def __init__(self, project_id: str, project_root: str | Path, *, max_chars: int = 5_000):
        self.project_id = project_id.strip()
        if not self.project_id:
            raise ValueError("project_id is required for Wiki adapter")
        self.root = Path(project_root).resolve()
        self.max_chars = max_chars

    def retrieve(self, request: KnowledgeRequest) -> list[KnowledgeResult]:
        _require_scope(request, self.project_id)
        commit = _git_commit(self.root)
        changed_paths = {
            _normalize_repo_path(changed_path)
            for changed_path in request.changed_paths
            if _normalize_repo_path(changed_path) and _normalize_repo_path(changed_path) != "."
        }
        search_text = _search_text(request)
        results = []
        for source, pattern, source_role in self._source_groups:
            source_path = self.root / source
            paths = sorted(source_path.glob(pattern)) if pattern else [source_path]
            for path in paths:
                if not _safe_file(self.root, path):
                    continue
                source_ref_path = path.relative_to(self.root).as_posix()
                raw = path.read_text(encoding="utf-8", errors="replace")
                metadata, body, body_line = _front_matter(raw)
                score = _score(body, search_text)
                normalized_source = source_ref_path.lower()
                changed_path_match = any(
                    normalized_source == changed_path
                    or normalized_source.startswith(changed_path + "/")
                    for changed_path in changed_paths
                )
                if score <= 0 and not changed_path_match:
                    continue
                if changed_path_match:
                    score = min(1.0, score + 0.4)
                snippet, offset = _snippet(body, search_text, self.max_chars)
                results.append(KnowledgeResult(
                    knowledge_type="wiki",
                    content=snippet,
                    source_ref=f"{source_ref_path}#L{body_line + offset - 1}",
                    score=score,
                    provenance={
                        "project_id": request.project_id,
                        "knowledge_status": metadata.get("knowledge_status", "unverified"),
                        "source_role": source_role,
                        "changed_path_match": changed_path_match,
                        "commit": commit,
                        "sha256": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
                    },
                ))
        return results


class AcceptedLearningAdapter:
    name = "accepted-learnings"
    knowledge_type = "learning"
    _required_review_fields = ("learning_id", "reviewed_by", "reviewed_at", "source_refs")

    def __init__(self, project_id: str, project_root: str | Path, *, max_chars: int = 3_000):
        self.project_id = project_id.strip()
        if not self.project_id:
            raise ValueError("project_id is required for learning adapter")
        self.root = Path(project_root).resolve()
        self.max_chars = max_chars

    def retrieve(self, request: KnowledgeRequest) -> list[KnowledgeResult]:
        _require_scope(request, self.project_id)
        pattern_dir = self.root / "docs" / "wiki" / "patterns"
        if not pattern_dir.is_dir():
            return []
        commit = _git_commit(self.root)
        results = []
        for path in sorted(pattern_dir.glob("*.md")):
            if not _safe_file(self.root, path):
                continue
            raw = path.read_text(encoding="utf-8", errors="replace")
            metadata, body, body_line = _front_matter(raw)
            if str(metadata.get("knowledge_status", "")).lower() != "accepted":
                continue
            if any(not metadata.get(field) for field in self._required_review_fields):
                continue
            search_text = _search_text(request)
            score = _score(body, search_text)
            source_refs = metadata.get("source_refs", [])
            if isinstance(source_refs, str):
                source_refs = [source_refs]
            changed_path_match = any(
                _path_matches(str(source_ref), changed_path)
                for source_ref in source_refs
                for changed_path in request.changed_paths
            )
            if changed_path_match:
                score = min(1.0, score + 0.4)
            if score <= 0:
                continue
            snippet, offset = _snippet(body, search_text, self.max_chars)
            results.append(KnowledgeResult(
                knowledge_type="learning",
                content=snippet,
                source_ref=f"{path.relative_to(self.root).as_posix()}#L{body_line + offset - 1}",
                score=score,
                provenance={
                    "project_id": request.project_id,
                    "knowledge_status": "accepted",
                    "learning_id": metadata["learning_id"],
                    "reviewed_by": metadata["reviewed_by"],
                    "reviewed_at": metadata["reviewed_at"],
                    "source_refs": source_refs,
                    "changed_path_match": changed_path_match,
                    "commit": commit,
                },
            ))
        return results


class GraphifyCodeAdapter:
    name = "graphify-code-index"
    knowledge_type = "code"

    def __init__(self, project_id: str, project_root: str | Path):
        self.project_id = project_id.strip()
        if not self.project_id:
            raise ValueError("project_id is required for Graphify adapter")
        self.root = Path(project_root).resolve()

    def retrieve(self, request: KnowledgeRequest) -> list[KnowledgeResult]:
        _require_scope(request, self.project_id)
        path = self.root / "graphify-out" / "graph.json"
        if not _safe_file(self.root, path):
            raise FileNotFoundError("Graphify index is missing; run the repository Graphify workflow")
        graph = json.loads(path.read_text(encoding="utf-8"))
        nodes = graph.get("nodes", [])
        links = graph.get("links", [])
        current_commit = _git_commit(self.root)
        index_commit = graph.get("built_at_commit")
        working_tree_dirty = _git_dirty(self.root)
        stale = bool(
            working_tree_dirty
            or (index_commit and current_commit and index_commit != current_commit)
        )
        search_text = _search_text(request)
        needles = _terms(search_text)
        changed_paths = tuple(_normalize_repo_path(value) for value in request.changed_paths)
        node_lookup = {str(node.get("id", "")): node for node in nodes}
        callers_by_target: dict[str, list[dict[str, Any]]] = {}
        callees_by_source: dict[str, list[dict[str, Any]]] = {}
        for link in links:
            if str(link.get("relation", "")) not in {"calls", "indirect_call"}:
                continue
            callers_by_target.setdefault(str(link.get("target", "")), []).append(link)
            callees_by_source.setdefault(str(link.get("source", "")), []).append(link)
        results = []
        for node in nodes:
            source_file = str(node.get("source_file", ""))
            if not _safe_graph_source(self.root, source_file):
                continue
            label = str(node.get("label", node.get("id", "")))
            community = str(node.get("community_name", ""))
            searchable = f"{label} {source_file} {community}".lower()
            overlap = len(needles & _terms(searchable))
            path_match = any(_path_matches(source_file, item) for item in changed_paths)
            if not overlap and not path_match:
                continue
            score = min(1.0, overlap / max(1, len(needles)) + (0.4 if path_match else 0.0))
            if stale:
                score *= 0.65
            source_location = str(node.get("source_location", ""))
            source_ref = source_file
            if source_location:
                source_ref += f"#{source_location}"
            content = f"{label} ({source_file})"
            if community:
                content += f"\nGraphify community: {community}"
            related_refs: dict[str, list[str]] = {"callers": [], "callees": [], "tests": []}
            related_labels: dict[str, list[str]] = {"callers": [], "callees": [], "tests": []}
            node_id = str(node.get("id", ""))
            related_links: list[tuple[dict[str, Any], str]] = [
                *((link, "caller") for link in callers_by_target.get(node_id, ())),
                *((link, "callee") for link in callees_by_source.get(node_id, ())),
            ]
            for link, direction in related_links:
                source_id = str(link.get("source", ""))
                target_id = str(link.get("target", ""))
                if direction == "caller" and target_id == node_id:
                    related_node = node_lookup.get(source_id, {})
                    related_file = str(link.get("source_file") or related_node.get("source_file", ""))
                    bucket = "tests" if _is_test_source(related_file) else "callers"
                    related_label = str(related_node.get("label", source_id))
                    related_location = str(
                        link.get("source_location") or related_node.get("source_location", "")
                    )
                elif direction == "callee" and source_id == node_id:
                    related_node = node_lookup.get(target_id, {})
                    related_file = str(related_node.get("source_file", ""))
                    bucket = "callees"
                    related_label = str(related_node.get("label", target_id))
                    related_location = str(related_node.get("source_location", ""))
                else:
                    continue
                if not _safe_graph_source(self.root, related_file):
                    continue
                related_ref = related_file + (f"#{related_location}" if related_location else "")
                if related_ref in related_refs[bucket]:
                    continue
                if len(related_refs[bucket]) >= 3:
                    continue
                related_refs[bucket].append(related_ref)
                related_labels[bucket].append(f"{related_label} ({related_ref})")
            for bucket in related_refs:
                if related_labels[bucket]:
                    content += f"\n{bucket.title()}: " + "; ".join(related_labels[bucket])
            results.append(KnowledgeResult(
                knowledge_type="code",
                content=content,
                source_ref=source_ref,
                score=score,
                provenance={
                    "project_id": request.project_id,
                    "index_commit": index_commit,
                    "current_commit": current_commit,
                    "stale_index": stale,
                    "working_tree_dirty": working_tree_dirty,
                    "changed_path_match": path_match,
                    "related_refs": related_refs,
                },
            ))
        return results


class KnowledgeStore:
    """Project-local adapter fan-out with source-preserving context bounds."""

    def __init__(self, adapters: list[KnowledgeAdapter]):
        self.adapters = list(adapters)

    async def retrieve(self, request: KnowledgeRequest) -> KnowledgeResponse:
        eligible = [a for a in self.adapters if a.knowledge_type in request.knowledge_types]

        async def invoke(adapter: KnowledgeAdapter) -> Any:
            result = adapter.retrieve(request)
            if inspect.isawaitable(result):
                return await result
            return result

        outcomes = []
        for adapter in eligible:
            try:
                outcomes.append(await invoke(adapter))
            except Exception as error:
                outcomes.append(error)
        response = KnowledgeResponse(
            project_id=request.project_id,
            query=request.query,
            error_signature=request.error_signature,
        )
        for adapter, outcome in zip(eligible, outcomes, strict=True):
            if isinstance(outcome, BaseException):
                response.degraded_sources.append(adapter.name)
            else:
                response.results.extend(outcome)
        response.results.sort(key=lambda result: result.score, reverse=True)
        response.results = self._fit_budget(response.results, request)
        response.context_chars = len(json.dumps(
            _section_payload(response.results), ensure_ascii=False
        ))
        return response

    @staticmethod
    def _fit_budget(
        results: list[KnowledgeResult], request: KnowledgeRequest
    ) -> list[KnowledgeResult]:
        selected: list[KnowledgeResult] = []
        for result in results[:request.limit]:
            trial = [*selected, result]
            if len(json.dumps(_section_payload(trial), ensure_ascii=False)) <= request.max_context_chars:
                selected.append(result)
                continue
            base = replace(result, content="")
            if len(json.dumps(_section_payload([*selected, base]), ensure_ascii=False)) > request.max_context_chars:
                continue
            low, high = 0, len(result.content)
            best: KnowledgeResult | None = None
            while low <= high:
                middle = (low + high) // 2
                candidate = replace(result, content=result.content[:middle])
                candidate_size = len(json.dumps(
                    _section_payload([*selected, candidate]), ensure_ascii=False
                ))
                if candidate_size <= request.max_context_chars:
                    best = candidate
                    low = middle + 1
                else:
                    high = middle - 1
            if best and best.content:
                selected.append(best)
        return selected
