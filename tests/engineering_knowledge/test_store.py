import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from engineering_knowledge import (
    AcceptedLearningAdapter,
    GraphifyCodeAdapter,
    KnowledgeRequest,
    KnowledgeResult,
    KnowledgeStore,
    MarkdownWikiAdapter,
)
from engineering_knowledge.cli import DEFAULT_PROJECT_ID, build_store


class KnowledgeStoreTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.wiki = self.root / "docs" / "wiki"
        self.wiki.mkdir(parents=True)
        (self.wiki / "architecture.md").write_text(
            "# Architecture\n\nThe timer uses a bounded retrieval context. "
            "Project isolation follows an explicit focuskid scope.\n",
            encoding="utf-8",
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    async def test_project_scope_mismatch_fails_closed(self):
        store = KnowledgeStore([MarkdownWikiAdapter("focuskid", self.root)])
        response = await store.retrieve(KnowledgeRequest(
            project_id="another-project", query="retrieval context"
        ))
        self.assertEqual(response.results, [])
        self.assertEqual(response.degraded_sources, ["project-wiki"])

    async def test_two_project_adapters_never_mix_wiki_results(self):
        other_root = self.root / "other-project"
        other_wiki = other_root / "docs" / "wiki"
        other_wiki.mkdir(parents=True)
        (other_wiki / "architecture.md").write_text(
            "# Architecture\n\nPrivate design for unrelated project isolation.\n",
            encoding="utf-8",
        )
        store = KnowledgeStore([
            MarkdownWikiAdapter("focuskid", self.root),
            MarkdownWikiAdapter("other-project", other_root),
        ])

        response = await store.retrieve(KnowledgeRequest(
            project_id="focuskid", query="project isolation",
        ))

        self.assertTrue(response.results)
        self.assertTrue(all("other-project" not in result.content for result in response.results))
        self.assertTrue(all("Private design" not in result.content for result in response.results))

    async def test_wiki_adapter_reads_only_docs_wiki_markdown(self):
        outside = self.root / "docs" / "stage-notes.md"
        outside.write_text(
            "# Stage notes\n\nBounded retrieval context appears only here.\n",
            encoding="utf-8",
        )

        response = await build_store(self.root).retrieve(KnowledgeRequest(
            project_id=DEFAULT_PROJECT_ID, query="bounded retrieval context",
            knowledge_types=("wiki",),
        ))

        self.assertEqual(
            [result.source_ref.split("#", 1)[0] for result in response.results],
            ["docs/wiki/architecture.md"],
        )

    async def test_graphify_never_returns_non_code_or_sensitive_source_paths(self):
        source = self.root / "src" / "safe.ts"
        source.parent.mkdir(parents=True)
        source.write_text("export function safeApi() {}\n", encoding="utf-8")
        graph_path = self.root / "graphify-out" / "graph.json"
        graph_path.parent.mkdir()
        graph_path.write_text(json.dumps({
            "built_at_commit": "abc123",
            "nodes": [
                {"id": "safe", "label": "safe_api", "source_file": "src/safe.ts", "source_location": "L1"},
                {"id": "env", "label": "secret_api_key", "source_file": ".env", "source_location": "L1"},
                {"id": "fixture", "label": "customer_name", "source_file": "fixtures/customer.ts", "source_location": "L1"},
            ],
            "links": [],
        }), encoding="utf-8")

        results = GraphifyCodeAdapter("focuskid", self.root).retrieve(KnowledgeRequest(
            project_id="focuskid", query="safe secret customer",
            knowledge_types=("code",),
        ))

        self.assertEqual([result.source_ref for result in results], ["src/safe.ts#L1"])

    async def test_learning_retrieval_only_returns_explicitly_accepted_with_provenance(self):
        patterns = self.wiki / "patterns"
        patterns.mkdir()
        (patterns / "candidate.md").write_text(
            "---\nknowledge_status: candidate\nlearning_id: candidate-1\n"
            "---\n# Candidate\nRetry the daily limit check after startup.\n",
            encoding="utf-8",
        )
        (patterns / "accepted.md").write_text(
            "---\nknowledge_status: accepted\nlearning_id: accepted-1\n"
            "reviewed_by: maintainer\nreviewed_at: 2026-10-24\n"
            "source_refs:\n  - src/services/db/schema.ts#L1\n"
            "---\n# Accepted\nRetry the daily limit check after startup.\n",
            encoding="utf-8",
        )
        store = KnowledgeStore([AcceptedLearningAdapter("focuskid", self.root)])

        response = await store.retrieve(KnowledgeRequest(
            project_id="focuskid", query="daily limit startup",
            knowledge_types=("learning",),
        ))

        self.assertEqual(len(response.results), 1)
        result = response.results[0]
        self.assertIn("accepted.md", result.source_ref)
        self.assertEqual(result.provenance["knowledge_status"], "accepted")
        self.assertEqual(result.provenance["reviewed_by"], "maintainer")
        self.assertEqual(result.provenance["source_refs"], ["src/services/db/schema.ts#L1"])

    async def test_learning_without_status_is_not_retrieved(self):
        patterns = self.wiki / "patterns"
        patterns.mkdir()
        (patterns / "legacy.md").write_text(
            "# Old note\nAlways retry the daily limit after startup.\n", encoding="utf-8"
        )
        store = KnowledgeStore([AcceptedLearningAdapter("focuskid", self.root)])

        response = await store.retrieve(KnowledgeRequest(
            project_id="focuskid", query="retry daily limit startup",
            knowledge_types=("learning",),
        ))

        self.assertEqual(response.results, [])

    async def test_accepted_learning_without_review_provenance_is_not_retrieved(self):
        patterns = self.wiki / "patterns"
        patterns.mkdir()
        (patterns / "unreviewed.md").write_text(
            "---\nknowledge_status: accepted\nlearning_id: unreviewed-1\n"
            "---\n# Unreviewed\nRetry the daily limit after startup.\n",
            encoding="utf-8",
        )

        results = AcceptedLearningAdapter("focuskid", self.root).retrieve(KnowledgeRequest(
            project_id="focuskid", query="daily limit startup",
            knowledge_types=("learning",),
        ))

        self.assertEqual(results, [])

    async def test_graphify_adapter_uses_repository_graph_shape_and_source_ref(self):
        source = self.root / "src" / "timerService.ts"
        source.parent.mkdir(parents=True)
        source.write_text("export function createTimerService() {}\n", encoding="utf-8")
        graph_path = self.root / "graphify-out" / "graph.json"
        graph_path.parent.mkdir()
        graph_path.write_text(json.dumps({
            "built_at_commit": "abc123",
            "nodes": [{
                "id": "timer_service", "label": "createTimerService",
                "source_file": "src/timerService.ts", "source_location": "L12",
                "community_name": "timer service",
            }],
            "links": [{"source": "timer_screen", "target": "timer_service"}],
        }), encoding="utf-8")
        adapter = GraphifyCodeAdapter("focuskid", self.root)

        results = adapter.retrieve(KnowledgeRequest(
            project_id="focuskid", query="create timer service",
            knowledge_types=("code",),
        ))

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].source_ref, "src/timerService.ts#L12")
        self.assertIn("createTimerService", results[0].content)
        self.assertEqual(results[0].provenance["index_commit"], "abc123")

    async def test_stale_graphify_index_is_marked_in_provenance(self):
        source = self.root / "src" / "timerService.ts"
        source.parent.mkdir(parents=True)
        source.write_text("export function createTimerService() {}\n", encoding="utf-8")
        graph_path = self.root / "graphify-out" / "graph.json"
        graph_path.parent.mkdir()
        graph_path.write_text(json.dumps({
            "built_at_commit": "old-commit",
            "nodes": [{"id": "timer_service", "label": "createTimerService",
                       "source_file": "src/timerService.ts", "source_location": "L1",
                       "community_name": "timer service"}],
            "links": [],
        }), encoding="utf-8")
        adapter = GraphifyCodeAdapter("focuskid", self.root)

        with patch("engineering_knowledge.store._git_commit", return_value="new-commit"):
            result = adapter.retrieve(KnowledgeRequest(
                project_id="focuskid", query="create timer service", knowledge_types=("code",),
            ))[0]

        self.assertTrue(result.provenance["stale_index"])
        self.assertEqual(result.provenance["current_commit"], "new-commit")

    async def test_graphify_index_is_stale_when_worktree_has_unindexed_changes(self):
        source = self.root / "src" / "timerService.ts"
        source.parent.mkdir(parents=True)
        source.write_text("export function createTimerService() {}\n", encoding="utf-8")
        graph_path = self.root / "graphify-out" / "graph.json"
        graph_path.parent.mkdir()
        graph_path.write_text(json.dumps({
            "built_at_commit": "same-commit",
            "nodes": [{"id": "timer_service", "label": "createTimerService",
                       "source_file": "src/timerService.ts", "source_location": "L1",
                       "community_name": "timer service"}],
            "links": [],
        }), encoding="utf-8")

        with patch("engineering_knowledge.store._git_commit", return_value="same-commit"), \
             patch("engineering_knowledge.store._git_dirty", return_value=True):
            result = GraphifyCodeAdapter("focuskid", self.root).retrieve(KnowledgeRequest(
                project_id="focuskid", query="create timer service", knowledge_types=("code",),
            ))[0]

        self.assertTrue(result.provenance["stale_index"])
        self.assertTrue(result.provenance["working_tree_dirty"])

    async def test_context_budget_bounds_serialized_sections_and_keeps_sources(self):
        class LargeAdapter:
            name = "large"
            knowledge_type = "wiki"

            def retrieve(self, request):
                return [KnowledgeResult(
                    "wiki", "Relevant fact " * 40,
                    "docs/wiki/architecture.md#L1", 1.0,
                    {"knowledge_status": "unverified"},
                )]

        response = await KnowledgeStore([LargeAdapter()]).retrieve(KnowledgeRequest(
            project_id="focuskid", query="relevant fact", max_context_chars=320
        ))

        serialized = json.dumps(response.to_dict()["sections"], ensure_ascii=False)
        self.assertLessEqual(len(serialized), 320)
        self.assertEqual(response.context_chars, len(serialized))
        self.assertEqual(len(response.results), 1)
        self.assertTrue(response.results[0].source_ref)

    async def test_unavailable_adapter_is_reported_without_dropping_other_sources(self):
        class BrokenAdapter:
            name = "graphify-code-index"
            knowledge_type = "code"

            def retrieve(self, request):
                raise OSError("index missing")

        store = KnowledgeStore([
            MarkdownWikiAdapter("focuskid", self.root), BrokenAdapter()
        ])
        response = await store.retrieve(KnowledgeRequest(
            project_id="focuskid", query="bounded retrieval",
        ))

        self.assertTrue(response.results)
        self.assertEqual(response.degraded_sources, ["graphify-code-index"])
        self.assertTrue(response.results[0].source_ref)

    async def test_cli_store_is_fixed_to_focuskid_project_and_reports_missing_graph(self):
        store = build_store(self.root)
        response = await store.retrieve(KnowledgeRequest(
            project_id=DEFAULT_PROJECT_ID,
            query="bounded retrieval context",
        ))

        self.assertEqual(response.project_id, "focuskid")
        self.assertTrue(response.results)
        self.assertEqual(response.degraded_sources, ["graphify-code-index"])

    async def test_empty_normalized_changed_path_does_not_match_every_source(self):
        (self.wiki / "unrelated.md").write_text("Unrelated architecture content", encoding="utf-8")

        response = await build_store(self.root).retrieve(KnowledgeRequest(
            project_id=DEFAULT_PROJECT_ID,
            query="quokka wombat zzyzx jibberish",
            knowledge_types=("wiki",),
            changed_paths=(".", "./"),
        ))

        self.assertEqual(response.results, [])


if __name__ == "__main__":
    unittest.main()