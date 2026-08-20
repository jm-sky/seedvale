import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from trace_analyzer.call_tree import build_call_tree
from trace_analyzer.cpu_analysis import aggregate_cpu, is_noise_operation, top_real_cpu_operations
from trace_analyzer.models import Event


def make_event(name: str, start: float, end: float, tid: int) -> Event:
    # Distinct tid per event keeps every node an independent top-level
    # root with no nesting, so self_time == duration for each.
    return Event(name=name, start=start, end=end, pid=1, tid=tid, ph="X")


class IsNoiseOperationTest(unittest.TestCase):
    def test_known_noise_names_are_case_insensitive(self) -> None:
        self.assertTrue(is_noise_operation("ThreadController"))
        self.assertTrue(is_noise_operation("threadpool_run"))
        self.assertTrue(is_noise_operation("THREADPOOL_TASK"))

    def test_other_names_are_not_noise(self) -> None:
        self.assertFalse(is_noise_operation("RunTask"))
        self.assertFalse(is_noise_operation("drawElements"))


class TopRealCpuOperationsTest(unittest.TestCase):
    def test_excludes_sub_millisecond_and_noise_operations(self) -> None:
        events = [
            make_event("TinyOp", 0, 0.5, tid=1),
            make_event("ThreadController", 0, 50, tid=2),
            make_event("RealOp", 0, 5, tid=3),
        ]

        roots = build_call_tree(events)
        result = top_real_cpu_operations(roots)

        self.assertEqual([n.name for n in result], ["RealOp"])

    def test_orders_by_self_time_descending_and_caps_at_top_n(self) -> None:
        events = [
            make_event(f"Op{i}", 0, i + 1, tid=i)
            for i in range(8)
        ]

        roots = build_call_tree(events)
        result = top_real_cpu_operations(roots)

        self.assertEqual(len(result), 5)
        durations = [n.self_time for n in result]
        self.assertEqual(durations, sorted(durations, reverse=True))
        self.assertEqual(result[0].name, "Op7")


class AggregateCpuTest(unittest.TestCase):
    def test_sums_self_total_and_calls_by_name(self) -> None:
        events = [
            make_event("Repeated", 0, 10, tid=1),
            make_event("Repeated", 0, 20, tid=2),
            make_event("Once", 0, 5, tid=3),
        ]

        roots = build_call_tree(events)
        result = aggregate_cpu(roots)
        by_name = {item["node"].name: item for item in result}

        self.assertAlmostEqual(by_name["Repeated"]["self"], 30.0)
        self.assertAlmostEqual(by_name["Repeated"]["total"], 30.0)
        self.assertEqual(by_name["Repeated"]["calls"], 2)
        self.assertEqual(by_name["Once"]["calls"], 1)

    def test_excludes_noise_operations(self) -> None:
        events = [
            make_event("threadpool_run", 0, 100, tid=1),
            make_event("RealOp", 0, 5, tid=2),
        ]

        roots = build_call_tree(events)
        result = aggregate_cpu(roots)

        self.assertEqual([item["node"].name for item in result], ["RealOp"])


if __name__ == "__main__":
    unittest.main()
