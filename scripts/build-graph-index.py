#!/usr/bin/env python3
"""Dependency-free fallback builder for graphify-out/graph.json (stdlib only).

Primary builder: the Graphify AST tool (see docs/wiki/knowledge-store.md). This script exists so
the derived code index can be rebuilt on a machine without the Graphify toolchain: a plain
file/symbol scan over the repository's TS/JS sources that emits the NetworkX-style shape the
knowledge adapter reads (nodes with id/label/source_file/source_location/community_name, links with
source/target/relation/source_file/source_location, plus built_at_commit).

Usage:  python3 scripts/build-graph-index.py [repo_root]
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

CODE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx"}
SKIP_DIRS = {
    "node_modules", "android", "ios", "dist", "web-build", ".git", ".expo",
    ".graphify", "graphify-out", "coverage", "__pycache__", ".kotlin",
}

DECL_RE = re.compile(
    r"^(?P<indent>\s*)"
    r"(?:export\s+)?(?:default\s+)?"
    r"(?:(?:async\s+)?function|class|const|let|var)\s+"
    r"(?P<name>[A-Za-z_$][\w$]*)"
    r"\s*(?:[=(:<]|$)"
)
TEST_NAME_RE = re.compile(r"\.(?:test|spec)\.[jt]sx?$")
IMPORT_RE = re.compile(
    r"import\s+(?:type\s+)?(?:(?P<default>[A-Za-z_$][\w$]*)\s*,\s*)?"
    r"(?:\{(?P<named>[^}]*)\}|\*\s+as\s+\*\s*)?\s*"
    r"(?:from\s+)?['\"](?P<spec>[^'\"]+)['\"]",
    re.S,
)
WORD_RE = re.compile(r"[A-Za-z_$][\w$]*")


def iter_code_files(root: Path):
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in CODE_SUFFIXES:
            continue
        rel_parts = path.relative_to(root).parts
        if any(part in SKIP_DIRS for part in rel_parts):
            continue
        yield path


def resolve_specifier(root: Path, importer: Path, spec: str) -> Path | None:
    if not spec.startswith("."):
        return None
    base = (importer.parent / spec).resolve()
    for suffix in ("", ".ts", ".tsx", ".js", ".jsx"):
        candidate = Path(str(base) + suffix)
        if candidate.is_file():
            return candidate
    for suffix in ("/index.ts", "/index.tsx", "/index.js"):
        candidate = Path(str(base) + suffix)
        if candidate.is_file():
            return candidate
    return None


def symbol_ranges(lines: list[str], decls: list[tuple[int, str]]) -> list[tuple[int, int, str]]:
    ranges = []
    for index, (line_no, name) in enumerate(decls):
        end = decls[index + 1][0] - 1 if index + 1 < len(decls) else len(lines)
        ranges.append((line_no, max(end, line_no), name))
    return ranges


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    nodes: list[dict] = []
    links: list[dict] = []
    node_ids_by_file: dict[Path, list[tuple[str, str]]] = {}
    decls_by_file: dict[Path, list[tuple[int, str]]] = {}
    ranges_by_file: dict[Path, list[tuple[int, int, str]]] = {}
    imports_by_file: dict[Path, list[tuple[str, Path]]] = {}

    for path in iter_code_files(root):
        rel = path.relative_to(root).as_posix()
        community = path.parent.relative_to(root).as_posix()
        text = path.read_text(encoding="utf-8", errors="replace")
        lines = text.splitlines()

        decls: list[tuple[int, str]] = []
        for line_no, line in enumerate(lines, start=1):
            if line.lstrip().startswith(("//", "*", "/*")):
                continue
            match = DECL_RE.match(line)
            if match:
                decls.append((line_no, match.group("name")))
        if not decls and TEST_NAME_RE.search(path.name):
            decls = [(1, path.stem)]
        if not decls:
            decls = [(1, path.stem or path.name)]

        seen: set[str] = set()
        unique_decls = []
        for line_no, name in decls:
            key = f"{name}@{line_no}"
            if key in seen:
                continue
            seen.add(key)
            unique_decls.append((line_no, name))
        decls = unique_decls

        node_ids: list[tuple[str, str]] = []
        for line_no, name in decls:
            node_id = f"{rel}:{line_no}:{name}"
            nodes.append({
                "id": node_id,
                "label": name,
                "source_file": rel,
                "source_location": f"L{line_no}",
                "community_name": community,
            })
            node_ids.append((node_id, name))

        node_ids_by_file[path] = node_ids
        decls_by_file[path] = decls
        ranges_by_file[path] = symbol_ranges(lines, decls)

        imports: list[tuple[str, Path]] = []
        for match in IMPORT_RE.finditer(text):
            spec = match.group("spec")
            target = resolve_specifier(root, path, spec)
            if target is None:
                continue
            names = []
            if match.group("default"):
                names.append(match.group("default"))
            named = match.group("named")
            if named:
                for part in named.split(","):
                    part = part.strip()
                    if not part or part.startswith("type "):
                        continue
                    names.append(re.split(r"\s+as\s+", part)[0].strip())
            for name in names:
                if name and name != "*":
                    imports.append((name, target))
        imports_by_file[path] = imports

    # Cross-file edges: importer symbol that mentions the imported name -> imported symbol.
    for path, imports in imports_by_file.items():
        for name, target in imports:
            targets = dict(node_ids_by_file.get(target, []))
            target_id = targets.get(name)
            if target_id is None:
                continue
            ranges = ranges_by_file.get(path, [])
            lines = (root / path).read_text(encoding="utf-8", errors="replace").splitlines()
            matched_source = None
            source_location = "L1"
            for line_no, end_line, symbol_name in ranges:
                body = "\n".join(lines[line_no - 1:end_line])
                if re.search(rf"\b{re.escape(name)}\b", body):
                    matched_source = f"{path}:{line_no}:{symbol_name}"
                    source_location = f"L{line_no}"
                    break
            if matched_source is None:
                fallback = node_ids_by_file.get(path) or []
                if not fallback:
                    continue
                matched_source, source_location = fallback[0], "L1"
            links.append({
                "source": matched_source,
                "target": target_id,
                "relation": "calls",
                "source_file": path.relative_to(root).as_posix(),
                "source_location": source_location,
            })

    # Intra-file calls: symbol A's body references symbol B declared in the same file.
    for path, ranges in ranges_by_file.items():
        by_name = dict(node_ids_by_file.get(path), ) if False else {
            name: node_id for node_id, name in node_ids_by_file.get(path, [])
        }
        decl_names = {name for _, name in decls_by_file.get(path, [])}
        lines = (root / path).read_text(encoding="utf-8", errors="replace").splitlines()
        rel = path.relative_to(root).as_posix()
        for line_no, end_line, symbol_name in ranges:
            source_id = f"{rel}:{line_no}:{symbol_name}"
            body_lines = lines[line_no - 1:end_line]
            for other in decl_names:
                if other == symbol_name:
                    continue
                for offset, line in enumerate(body_lines):
                    for match in WORD_RE.finditer(line):
                        if match.group(0) == other and re.search(
                            rf"{re.escape(other)}\s*\(", line[match.start():]
                        ):
                            other_line = next(
                                (n for n, nm in decls_by_file.get(path, []) if nm == other), None
                            )
                            if other_line is None:
                                continue
                            links.append({
                                "source": source_id,
                                "target": f"{rel}:{other_line}:{other}",
                                "relation": "calls",
                                "source_file": rel,
                                "source_location": f"L{line_no + offset}",
                            })
                            break
                    else:
                        continue
                    break

    # Deduplicate links.
    unique_links = []
    seen_links = set()
    for link in links:
        key = (link["source"], link["target"], link["relation"])
        if key in seen_links or link["source"] == link["target"]:
            continue
        seen_links.add(key)
        unique_links.append(link)

    try:
        commit = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            check=True, capture_output=True, text=True, timeout=2,
        ).stdout.strip() or None
    except (OSError, subprocess.SubprocessError):
        commit = None

    payload = {
        "built_at_commit": commit,
        "generator": "scripts/build-graph-index.py (stdlib fallback)",
        "nodes": nodes,
        "links": unique_links,
    }
    out = root / "graphify-out" / "graph.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    communities = len({node["community_name"] for node in nodes})
    print(f"Graphify fallback scan complete: {len(nodes)} nodes, "
          f"{len(unique_links)} links, {communities} communities -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())