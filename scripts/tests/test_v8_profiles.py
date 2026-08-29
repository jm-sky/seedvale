import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from trace_analyzer.categorize import (
    CATEGORY_AMBIGUOUS,
    CATEGORY_APPLICATION,
    CATEGORY_CHROME_V8_PROFILER,
    CATEGORY_FRAMEWORK_RUNTIME,
    classify_source_ownership,
)
from trace_analyzer.v8_profiles import (
    application_profile_operations,
    extract_profile_operations,
    iter_cpu_profiles,
    profile_node_operation,
)


def make_chunk_event(
    profile_id: str,
    ts: int,
    nodes: list[dict] | None = None,
    samples: list[int] | None = None,
    time_deltas: list[float] | None = None,
    pid: int = 1,
) -> dict:
    data: dict = {}

    if nodes is not None:
        data["nodes"] = nodes

    if samples is not None:
        data["samples"] = samples

    if time_deltas is not None:
        data["timeDeltas"] = time_deltas

    return {
        "name": "ProfileChunk",
        "ph": "P",
        "id": profile_id,
        "ts": ts,
        "pid": pid,
        "args": {"data": {"cpuProfile": data}},
    }


def make_node(
    node_id: int,
    function_name: str,
    url: str = "",
    line: int | None = None,
    column: int | None = None,
    children: list[int] | None = None,
) -> dict:
    call_frame: dict = {"functionName": function_name, "url": url}

    if line is not None:
        call_frame["lineNumber"] = line

    if column is not None:
        call_frame["columnNumber"] = column

    node: dict = {"id": node_id, "callFrame": call_frame}

    if children is not None:
        node["children"] = children

    return node


class ClassifySourceOwnershipTest(unittest.TestCase):
    def test_seedvale_src_path_is_application(self) -> None:
        self.assertEqual(
            classify_source_ownership(
                "http://localhost:5577/src/terrain/chunkManager.ts"
            ),
            CATEGORY_APPLICATION,
        )

    def test_node_modules_is_framework_runtime(self) -> None:
        self.assertEqual(
            classify_source_ownership(
                "http://localhost:5577/node_modules/.vite/deps/chunk-4SR3H3JQ.js"
            ),
            CATEGORY_FRAMEWORK_RUNTIME,
        )

    def test_empty_url_is_chrome_v8_profiler(self) -> None:
        self.assertEqual(
            classify_source_ownership(""),
            CATEGORY_CHROME_V8_PROFILER,
        )

    def test_chrome_extension_url_is_chrome_v8_profiler(self) -> None:
        self.assertEqual(
            classify_source_ownership(
                "chrome-extension://abc/content/bootstrap.js"
            ),
            CATEGORY_CHROME_V8_PROFILER,
        )

    def test_unrecognized_url_is_ambiguous_rather_than_guessed(self) -> None:
        self.assertEqual(
            classify_source_ownership("http://localhost:5577/index.html"),
            CATEGORY_AMBIGUOUS,
        )


class ProfileNodeOperationCategoryTest(unittest.TestCase):
    def test_named_webgl_function_keeps_existing_webgl_category(self) -> None:
        node = make_node(
            1,
            "bindTexture",
            url="",
        )

        operation = profile_node_operation(node, {1: node}, {})

        self.assertEqual(operation.category, "WebGL")

    def test_named_three_renderer_function_keeps_existing_category(self) -> None:
        node = make_node(
            1,
            "WebGLRenderer.renderBufferDirect",
            url="http://localhost:5577/node_modules/.vite/deps/chunk.js",
        )

        operation = profile_node_operation(node, {1: node}, {})

        self.assertEqual(operation.category, "THREE.JS RENDERER")

    def test_src_url_function_is_application(self) -> None:
        node = make_node(
            1,
            "fbm01",
            url="http://localhost:5577/src/terrain/fbm.ts",
            line=20,
            column=21,
        )

        operation = profile_node_operation(node, {1: node}, {})

        self.assertEqual(operation.category, CATEGORY_APPLICATION)
        self.assertEqual(operation.url, "http://localhost:5577/src/terrain/fbm.ts")
        self.assertEqual(operation.line, 21)
        self.assertEqual(operation.column, 22)

    def test_vendor_url_function_is_framework_runtime(self) -> None:
        node = make_node(
            1,
            "reactive",
            url="http://localhost:5577/node_modules/.vite/deps/chunk-EUM7VVWA.js",
        )

        operation = profile_node_operation(node, {1: node}, {})

        self.assertEqual(operation.category, CATEGORY_FRAMEWORK_RUNTIME)

    def test_no_url_native_binding_is_chrome_v8_profiler(self) -> None:
        node = make_node(1, "(garbage collector)", url="")

        operation = profile_node_operation(node, {1: node}, {})

        self.assertEqual(operation.category, CATEGORY_CHROME_V8_PROFILER)


class FunctionIdentityTest(unittest.TestCase):
    def test_same_name_different_location_are_not_merged(self) -> None:
        nodes = [
            make_node(1, "(root)", children=[2, 3]),
            make_node(
                2,
                "update",
                url="http://localhost:5577/src/ai/NpcAgent.ts",
                line=100,
                column=5,
            ),
            make_node(
                3,
                "update",
                url="http://localhost:5577/src/fauna/AnimalAgent.ts",
                line=200,
                column=9,
            ),
        ]

        profiles = [
            {
                "nodes": nodes,
                "samples": [2, 3],
                "timeDeltas": [1000.0, 2000.0],
            }
        ]

        operations = extract_profile_operations(profiles)
        app_ops = {
            (op.url, op.line): op
            for op in operations
            if op.category == CATEGORY_APPLICATION
        }

        self.assertEqual(len(app_ops), 2)
        self.assertIn(
            ("http://localhost:5577/src/ai/NpcAgent.ts", 101), app_ops
        )
        self.assertIn(
            ("http://localhost:5577/src/fauna/AnimalAgent.ts", 201), app_ops
        )

    def test_same_function_aggregates_across_multiple_samples(self) -> None:
        nodes = [
            make_node(1, "(root)", children=[2]),
            make_node(
                2,
                "tick",
                url="http://localhost:5577/src/app/gameLoop.ts",
                line=10,
                column=1,
            ),
        ]

        profiles = [
            {
                "nodes": nodes,
                "samples": [2, 2, 2],
                "timeDeltas": [500.0, 500.0, 500.0],
            }
        ]

        operations = extract_profile_operations(profiles)
        app_ops = [
            op for op in operations if op.category == CATEGORY_APPLICATION
        ]

        self.assertEqual(len(app_ops), 1)
        self.assertEqual(app_ops[0].samples, 3)
        self.assertAlmostEqual(app_ops[0].duration_ms, 1.5)


class MissingLocationDataTest(unittest.TestCase):
    def test_missing_line_and_column_are_none(self) -> None:
        node = make_node(
            1,
            "mysteryFn",
            url="http://localhost:5577/src/mystery.ts",
        )

        operation = profile_node_operation(node, {1: node}, {})

        self.assertIsNone(operation.line)
        self.assertIsNone(operation.column)
        self.assertEqual(operation.category, CATEGORY_APPLICATION)

    def test_missing_url_falls_back_to_chrome_v8_profiler(self) -> None:
        node = make_node(1, "someNativeCall")

        operation = profile_node_operation(node, {1: node}, {})

        self.assertEqual(operation.url, "")
        self.assertEqual(operation.category, CATEGORY_CHROME_V8_PROFILER)


class EmptyOrIncompleteProfilesTest(unittest.TestCase):
    def test_profile_with_no_nodes_contributes_nothing(self) -> None:
        operations = extract_profile_operations(
            [{"nodes": [], "samples": [1, 2], "timeDeltas": [1.0, 2.0]}]
        )

        self.assertEqual(operations, [])

    def test_samples_referencing_unknown_node_ids_are_skipped(self) -> None:
        nodes = [make_node(1, "(root)")]

        operations = extract_profile_operations(
            [{"nodes": nodes, "samples": [999], "timeDeltas": [10.0]}]
        )

        # Only the "(root)" node itself is recorded via node
        # occurrence tracking; the unresolved sample id contributes
        # nothing rather than being mis-attributed.
        self.assertEqual(len(operations), 1)
        self.assertEqual(operations[0].samples, 0)
        self.assertEqual(operations[0].node_occurrences, 1)

    def test_extract_profile_operations_with_no_profiles_returns_empty(
        self,
    ) -> None:
        self.assertEqual(extract_profile_operations([]), [])

    def test_application_profile_operations_empty_when_none_qualify(
        self,
    ) -> None:
        self.assertEqual(application_profile_operations([]), [])


class IterCpuProfilesChunkMergingTest(unittest.TestCase):
    def test_merges_chunks_sharing_a_profile_id_in_ts_order(self) -> None:
        node_a = make_node(1, "(root)")
        node_b = make_node(2, "sampleFn", url="http://localhost:5577/src/a.ts")

        events = [
            make_chunk_event(
                "0x1",
                ts=100,
                nodes=[node_a, node_b],
                samples=[1],
                time_deltas=[0.0],
            ),
            # Later chunk of the SAME profile id: no new nodes, but a
            # sample referencing a node id introduced by the earlier
            # chunk above. A per-chunk-only lookup would drop this
            # sample; merging by profile id must resolve it.
            make_chunk_event(
                "0x1",
                ts=200,
                nodes=[],
                samples=[2],
                time_deltas=[15.0],
            ),
        ]

        profiles = list(iter_cpu_profiles(events))

        self.assertEqual(len(profiles), 1)

        operations = extract_profile_operations(profiles)
        by_name = {op.name: op for op in operations}

        self.assertIn("sampleFn", by_name)
        self.assertEqual(by_name["sampleFn"].samples, 1)
        self.assertAlmostEqual(by_name["sampleFn"].duration_ms, 0.015)

    def test_different_profile_ids_are_not_merged_together(self) -> None:
        node_1 = make_node(1, "fnOne", url="http://localhost:5577/src/one.ts")
        node_2 = make_node(1, "fnTwo", url="http://localhost:5577/src/two.ts")

        events = [
            make_chunk_event("0x1", ts=100, nodes=[node_1], samples=[1]),
            make_chunk_event("0x2", ts=100, nodes=[node_2], samples=[1]),
        ]

        profiles = list(iter_cpu_profiles(events))

        self.assertEqual(len(profiles), 2)

        operations = extract_profile_operations(profiles)
        names = {op.name for op in operations}

        self.assertEqual(names, {"fnOne", "fnTwo"})

    def test_events_without_a_cpu_profile_are_ignored(self) -> None:
        events = [
            {"name": "RunTask", "ph": "X", "ts": 1, "dur": 5, "args": {}},
            {"name": "ProfileChunk", "ph": "P", "args": {"data": {}}},
        ]

        self.assertEqual(list(iter_cpu_profiles(events)), [])


class ApplicationProfileOperationsRankingTest(unittest.TestCase):
    def test_prefers_real_cpu_time_over_sample_count(self) -> None:
        nodes = [
            make_node(
                1,
                "hot",
                url="http://localhost:5577/src/hot.ts",
                line=1,
                column=1,
            ),
            make_node(
                2,
                "frequent",
                url="http://localhost:5577/src/frequent.ts",
                line=1,
                column=1,
            ),
        ]

        profiles = [
            {
                "nodes": nodes,
                # "frequent" is sampled far more often, but "hot"
                # accounts for much more sampled CPU time and must
                # rank first.
                "samples": [1] + [2] * 10,
                "timeDeltas": [5000.0] + [10.0] * 10,
            }
        ]

        operations = extract_profile_operations(profiles)
        ranked = application_profile_operations(operations)

        self.assertEqual([op.name for op in ranked], ["hot", "frequent"])

    def test_excludes_non_application_categories(self) -> None:
        nodes = [
            make_node(1, "(root)"),
            make_node(
                2,
                "vendorFn",
                url="http://localhost:5577/node_modules/dep.js",
            ),
        ]

        profiles = [
            {
                "nodes": nodes,
                "samples": [1, 2],
                "timeDeltas": [10.0, 10.0],
            }
        ]

        operations = extract_profile_operations(profiles)
        ranked = application_profile_operations(operations)

        self.assertEqual(ranked, [])


class WebglAnalysisPreservedTest(unittest.TestCase):
    def test_webgl_shader_and_three_functions_still_extracted_as_before(
        self,
    ) -> None:
        nodes = [
            make_node(1, "(root)", children=[2, 3, 4]),
            make_node(2, "bindTexture"),
            make_node(3, "compileShader"),
            make_node(4, "WebGLRenderer.renderBufferDirect"),
        ]

        profiles = [
            {
                "nodes": nodes,
                "samples": [2, 3, 4],
                "timeDeltas": [1.0, 1.0, 1.0],
            }
        ]

        operations = extract_profile_operations(profiles)
        categories = {op.name: op.category for op in operations}

        self.assertEqual(categories["bindTexture"], "WebGL")
        self.assertEqual(categories["compileShader"], "SHADER / PROGRAM")
        self.assertEqual(
            categories["WebGLRenderer.renderBufferDirect"],
            "THREE.JS RENDERER",
        )


if __name__ == "__main__":
    unittest.main()
