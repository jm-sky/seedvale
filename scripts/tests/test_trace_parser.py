import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from trace_analyzer.trace_parser import (
    build_be_events,
    get_trace_date_time,
    load_trace,
    parse_timed_events,
    trace_start_ms,
)


class ParseTimedEventsTest(unittest.TestCase):
    def test_keeps_positive_duration_x_events(self) -> None:
        events = [
            {"name": "RunTask", "ph": "X", "ts": 1000, "dur": 500, "pid": 1, "tid": 2},
        ]

        result = parse_timed_events(events)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].name, "RunTask")
        self.assertAlmostEqual(result[0].start, 1.0)
        self.assertAlmostEqual(result[0].end, 1.5)
        self.assertEqual(result[0].pid, 1)
        self.assertEqual(result[0].tid, 2)

    def test_drops_zero_or_negative_duration(self) -> None:
        events = [
            {"name": "Zero", "ph": "X", "ts": 1000, "dur": 0, "pid": 1, "tid": 1},
            {"name": "Negative", "ph": "X", "ts": 1000, "dur": -5, "pid": 1, "tid": 1},
        ]

        self.assertEqual(parse_timed_events(events), [])

    def test_ignores_non_x_events_and_missing_fields(self) -> None:
        events = [
            {"name": "Begin", "ph": "B", "ts": 1000, "pid": 1, "tid": 1},
            {"name": "NoDur", "ph": "X", "ts": 1000, "pid": 1, "tid": 1},
            {"name": "NoTs", "ph": "X", "dur": 100, "pid": 1, "tid": 1},
        ]

        self.assertEqual(parse_timed_events(events), [])


class BuildBeEventsTest(unittest.TestCase):
    def test_pairs_matching_begin_end_on_same_thread(self) -> None:
        events = [
            {"name": "V8.Execute", "ph": "B", "ts": 1000, "pid": 1, "tid": 1},
            {"name": "V8.Execute", "ph": "E", "ts": 3000, "pid": 1, "tid": 1},
        ]

        result = build_be_events(events)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].name, "V8.Execute")
        self.assertAlmostEqual(result[0].start, 1.0)
        self.assertAlmostEqual(result[0].end, 3.0)

    def test_nested_begin_end_pairs_are_matched_lifo(self) -> None:
        events = [
            {"name": "Outer", "ph": "B", "ts": 0, "pid": 1, "tid": 1},
            {"name": "Inner", "ph": "B", "ts": 100, "pid": 1, "tid": 1},
            {"name": "Inner", "ph": "E", "ts": 200, "pid": 1, "tid": 1},
            {"name": "Outer", "ph": "E", "ts": 300, "pid": 1, "tid": 1},
        ]

        result = build_be_events(events)
        by_name = {event.name: event for event in result}

        self.assertAlmostEqual(by_name["Inner"].start, 0.1)
        self.assertAlmostEqual(by_name["Inner"].end, 0.2)
        self.assertAlmostEqual(by_name["Outer"].start, 0.0)
        self.assertAlmostEqual(by_name["Outer"].end, 0.3)

    def test_unmatched_end_is_ignored(self) -> None:
        events = [
            {"name": "Orphan", "ph": "E", "ts": 100, "pid": 1, "tid": 1},
        ]

        self.assertEqual(build_be_events(events), [])

    def test_different_threads_do_not_cross_match(self) -> None:
        events = [
            {"name": "A", "ph": "B", "ts": 0, "pid": 1, "tid": 1},
            {"name": "A", "ph": "E", "ts": 100, "pid": 1, "tid": 2},
        ]

        self.assertEqual(build_be_events(events), [])


class LoadTraceTest(unittest.TestCase):
    def test_loads_traceevents_wrapper(self) -> None:
        payload = {"traceEvents": [{"name": "A", "ph": "X", "ts": 0, "dur": 1}]}

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "trace.json"
            path.write_text(json.dumps(payload), encoding="utf-8")

            events = load_trace(path)

        self.assertEqual(events, payload["traceEvents"])

    def test_loads_bare_event_list(self) -> None:
        payload = [{"name": "A", "ph": "X", "ts": 0, "dur": 1}]

        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "trace.json"
            path.write_text(json.dumps(payload), encoding="utf-8")

            events = load_trace(path)

        self.assertEqual(events, payload)

    def test_rejects_unsupported_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "trace.json"
            path.write_text(json.dumps({"foo": "bar"}), encoding="utf-8")

            with self.assertRaises(ValueError):
                load_trace(path)


class TraceStartMsTest(unittest.TestCase):
    def test_ignores_metadata_zero_timestamp_sentinel(self) -> None:
        events = [
            {"name": "thread_name", "ph": "M", "ts": 0, "pid": 1, "tid": 1},
            {"name": "RunTask", "ph": "X", "ts": 5_000_000, "dur": 100, "pid": 1, "tid": 1},
        ]

        self.assertAlmostEqual(trace_start_ms(events), 5000.0)

    def test_returns_none_when_no_timed_events(self) -> None:
        events = [
            {"name": "thread_name", "ph": "M", "ts": 0, "pid": 1, "tid": 1},
        ]

        self.assertIsNone(trace_start_ms(events))

    def test_picks_earliest_across_event_types(self) -> None:
        events = [
            {"name": "A", "ph": "X", "ts": 3000, "dur": 10, "pid": 1, "tid": 1},
            {"name": "B", "ph": "B", "ts": 1000, "pid": 1, "tid": 1},
        ]

        self.assertAlmostEqual(trace_start_ms(events), 1.0)


class TraceDateTimeTest(unittest.TestCase):
    def test_parses_timestamp_from_filename(self) -> None:
        label = get_trace_date_time(Path("Trace-20260820T085349.json"))

        self.assertEqual(label, "Trace date/time: 2026-08-20 08:53:49")

    def test_returns_empty_string_when_no_timestamp_present(self) -> None:
        self.assertEqual(get_trace_date_time(Path("not-a-trace.json")), "")


if __name__ == "__main__":
    unittest.main()
