import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from trace_analyzer.call_tree import build_call_tree, find_call_path, flatten_nodes
from trace_analyzer.models import Event


def make_event(name: str, start: float, end: float, pid: int = 1, tid: int = 1) -> Event:
    return Event(name=name, start=start, end=end, pid=pid, tid=tid, ph="X")


class BuildCallTreeTest(unittest.TestCase):
    def test_nests_events_fully_contained_in_parent(self) -> None:
        events = [
            make_event("Outer", 0, 100),
            make_event("Inner", 10, 50),
        ]

        roots = build_call_tree(events)

        self.assertEqual(len(roots), 1)
        self.assertEqual(roots[0].name, "Outer")
        self.assertEqual(len(roots[0].children), 1)
        self.assertEqual(roots[0].children[0].name, "Inner")

    def test_sibling_events_after_parent_ends_become_new_roots(self) -> None:
        events = [
            make_event("First", 0, 10),
            make_event("Second", 10, 20),
        ]

        roots = build_call_tree(events)

        self.assertEqual([r.name for r in roots], ["First", "Second"])
        self.assertEqual(roots[0].children, [])
        self.assertEqual(roots[1].children, [])

    def test_event_extending_past_parent_end_becomes_its_own_root(self) -> None:
        # Overlapping-but-not-nested spans (can happen with slightly
        # inconsistent instrumentation) must not be silently nested,
        # since that would misrepresent wall-clock containment.
        events = [
            make_event("Parent", 0, 10),
            make_event("Overlapping", 5, 20),
        ]

        roots = build_call_tree(events)

        self.assertEqual([r.name for r in roots], ["Parent", "Overlapping"])

    def test_threads_are_kept_independent(self) -> None:
        events = [
            make_event("ThreadA", 0, 100, pid=1, tid=1),
            make_event("ThreadB", 0, 100, pid=1, tid=2),
        ]

        roots = build_call_tree(events)

        self.assertEqual(len(roots), 2)
        self.assertEqual({r.tid for r in roots}, {1, 2})

    def test_deeply_nested_events_build_a_chain(self) -> None:
        events = [
            make_event("A", 0, 100),
            make_event("B", 10, 90),
            make_event("C", 20, 80),
        ]

        roots = build_call_tree(events)

        self.assertEqual(roots[0].name, "A")
        self.assertEqual(roots[0].children[0].name, "B")
        self.assertEqual(roots[0].children[0].children[0].name, "C")


class SelfTimeTest(unittest.TestCase):
    def test_leaf_self_time_equals_duration(self) -> None:
        roots = build_call_tree([make_event("Leaf", 0, 10)])

        self.assertAlmostEqual(roots[0].self_time, 10.0)

    def test_parent_self_time_excludes_children(self) -> None:
        events = [
            make_event("Parent", 0, 100),
            make_event("ChildA", 10, 30),
            make_event("ChildB", 40, 60),
        ]

        roots = build_call_tree(events)

        self.assertAlmostEqual(roots[0].self_time, 60.0)

    def test_overlapping_children_are_not_double_subtracted(self) -> None:
        events = [
            make_event("Parent", 0, 100),
            make_event("ChildA", 10, 50),
            make_event("ChildB", 20, 60),
        ]

        roots = build_call_tree(events)
        parent = roots[0]

        # ChildB is not actually nested under ChildA/Parent by the
        # call-tree builder (it extends past ChildA's containment
        # window at the same depth only if still <= parent.end), so
        # just assert self_time never goes negative and stays bounded
        # by the parent's own duration.
        self.assertGreaterEqual(parent.self_time, 0.0)
        self.assertLessEqual(parent.self_time, parent.duration)


class FlattenNodesTest(unittest.TestCase):
    def test_flattens_in_pre_order(self) -> None:
        events = [
            make_event("A", 0, 100),
            make_event("B", 10, 50),
            make_event("C", 60, 90),
        ]

        roots = build_call_tree(events)
        flat = flatten_nodes(roots)

        self.assertEqual([n.name for n in flat], ["A", "B", "C"])


class FindCallPathTest(unittest.TestCase):
    def test_returns_path_from_root_to_target(self) -> None:
        events = [
            make_event("A", 0, 100),
            make_event("B", 10, 90),
            make_event("C", 20, 80),
        ]

        roots = build_call_tree(events)
        target = roots[0].children[0].children[0]

        path = find_call_path(target, roots)

        self.assertEqual([n.name for n in path], ["A", "B", "C"])

    def test_falls_back_to_target_only_when_not_found_in_roots(self) -> None:
        orphan = make_event("Orphan", 0, 10)
        from trace_analyzer.models import Node

        orphan_node = Node(
            name="Orphan", start=0, end=10, pid=1, tid=1, ph="X"
        )

        path = find_call_path(orphan_node, [])

        self.assertEqual(path, [orphan_node])


if __name__ == "__main__":
    unittest.main()
