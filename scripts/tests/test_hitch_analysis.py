import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from trace_analyzer.call_tree import build_call_tree
from trace_analyzer.hitch_analysis import (
    MIN_FRAMES_FOR_RELIABLE_STATS,
    compute_frame_stats,
    extract_frame_timestamps,
    top_long_cpu_tasks,
)
from trace_analyzer.models import Event


def make_event(name: str, start: float, end: float, tid: int = 1) -> Event:
    return Event(name=name, start=start, end=end, pid=1, tid=tid, ph="X")


def draw_frame(ts_us: int, pid: int = 1, tid: int = 1, layer_tree_id: int = 1) -> dict:
    return {
        "name": "DrawFrame",
        "ph": "I",
        "ts": ts_us,
        "pid": pid,
        "tid": tid,
        "args": {"layerTreeId": layer_tree_id},
    }


class TopLongCpuTasksTest(unittest.TestCase):
    def test_ranks_top_level_roots_by_duration(self) -> None:
        events = [
            make_event("Small", 0, 5, tid=1),
            make_event("Big", 0, 50, tid=2),
            make_event("Medium", 0, 20, tid=3),
        ]

        roots = build_call_tree(events)
        result = top_long_cpu_tasks(roots, top_n=5)

        self.assertEqual([n.name for n in result], ["Big", "Medium", "Small"])

    def test_does_not_double_count_nested_children_as_separate_hitches(self) -> None:
        events = [
            make_event("Outer", 0, 100, tid=1),
            make_event("Inner", 10, 90, tid=1),
        ]

        roots = build_call_tree(events)
        result = top_long_cpu_tasks(roots, top_n=5)

        # Inner is nested inside Outer's call tree, not a second
        # top-level root, so it must not appear as its own hitch entry.
        self.assertEqual([n.name for n in result], ["Outer"])

    def test_respects_top_n(self) -> None:
        events = [make_event(f"Op{i}", 0, i + 1, tid=i) for i in range(8)]

        roots = build_call_tree(events)
        result = top_long_cpu_tasks(roots, top_n=3)

        self.assertEqual(len(result), 3)


class ExtractFrameTimestampsTest(unittest.TestCase):
    def test_picks_the_dominant_frame_sequence(self) -> None:
        raw_events = (
            [draw_frame(1000 + i * 16700, pid=1, tid=1, layer_tree_id=1) for i in range(20)]
            + [draw_frame(5_000_000 + i * 20000, pid=2, tid=2, layer_tree_id=2) for i in range(2)]
        )

        timestamps = extract_frame_timestamps(raw_events)

        self.assertEqual(len(timestamps), 20)
        self.assertEqual(timestamps, sorted(timestamps))

    def test_ignores_non_instant_phase_and_other_event_names(self) -> None:
        raw_events = [
            {"name": "DrawFrame", "ph": "X", "ts": 1000, "dur": 10, "pid": 1, "tid": 1, "args": {}},
            {"name": "BeginFrame", "ph": "I", "ts": 2000, "pid": 1, "tid": 1, "args": {}},
        ]

        self.assertEqual(extract_frame_timestamps(raw_events), [])

    def test_returns_empty_list_when_no_draw_frame_events(self) -> None:
        self.assertEqual(extract_frame_timestamps([]), [])


class ComputeFrameStatsTest(unittest.TestCase):
    def test_returns_none_below_reliability_threshold(self) -> None:
        timestamps = [float(i) for i in range(MIN_FRAMES_FOR_RELIABLE_STATS)]

        self.assertIsNone(compute_frame_stats(timestamps))

    def test_computes_stats_for_uniform_frame_cadence(self) -> None:
        # MIN_FRAMES_FOR_RELIABLE_STATS + 1 timestamps -> exactly
        # MIN_FRAMES_FOR_RELIABLE_STATS durations, all 16.7ms apart.
        # 15.0 ms is comfortably under the 16.7 ms/60fps budget even
        # after floating-point accumulation.
        timestamps = [
            i * 15.0 for i in range(MIN_FRAMES_FOR_RELIABLE_STATS + 1)
        ]

        stats = compute_frame_stats(timestamps)

        self.assertIsNotNone(stats)
        self.assertEqual(stats.frame_count, MIN_FRAMES_FOR_RELIABLE_STATS)
        self.assertAlmostEqual(stats.median_ms, 15.0, places=3)
        self.assertAlmostEqual(stats.average_ms, 15.0, places=3)
        self.assertEqual(stats.over_60fps_budget, 0)
        self.assertEqual(stats.over_30fps_budget, 0)
        self.assertEqual(stats.over_hitch_budget, 0)

    def test_flags_hitch_frame_and_reports_its_start(self) -> None:
        timestamps = [i * 15.0 for i in range(MIN_FRAMES_FOR_RELIABLE_STATS)]
        hitch_start = timestamps[-1]
        timestamps.append(hitch_start + 150.0)

        stats = compute_frame_stats(timestamps)

        self.assertIsNotNone(stats)
        self.assertAlmostEqual(stats.max_ms, 150.0, places=3)
        self.assertAlmostEqual(stats.max_start_ms, hitch_start, places=3)
        self.assertEqual(stats.over_hitch_budget, 1)
        self.assertEqual(stats.over_30fps_budget, 1)
        self.assertEqual(stats.over_60fps_budget, 1)


if __name__ == "__main__":
    unittest.main()
