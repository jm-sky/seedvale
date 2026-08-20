"""
Building a per-thread call tree from normalized `Event`s, and helpers to
walk/flatten it.
"""

from __future__ import annotations

from collections import defaultdict

from .models import Event, Node


def build_call_tree(
    events: list[Event],
) -> list[Node]:
    by_thread: dict[
        tuple[int, int],
        list[Event],
    ] = defaultdict(list)

    for event in events:
        by_thread[(event.pid, event.tid)].append(event)

    roots: list[Node] = []

    for thread_events in by_thread.values():
        thread_events.sort(
            key=lambda event: (
                event.start,
                -event.end,
            )
        )

        stack: list[Node] = []

        for event in thread_events:
            while (
                stack
                and event.start >= stack[-1].end
            ):
                stack.pop()

            node = Node(
                name=event.name,
                start=event.start,
                end=event.end,
                pid=event.pid,
                tid=event.tid,
                ph=event.ph,
                args=event.args,
            )

            if stack:
                parent = stack[-1]

                if event.end <= parent.end:
                    parent.children.append(node)
                else:
                    roots.append(node)
                    stack.clear()
                    stack.append(node)
                    continue
            else:
                roots.append(node)

            stack.append(node)

    return roots


def flatten_nodes(
    roots: list[Node],
) -> list[Node]:
    result: list[Node] = []

    stack = list(reversed(roots))

    while stack:
        node = stack.pop()

        result.append(node)

        for child in reversed(node.children):
            stack.append(child)

    return result


def find_call_path(
    target: Node,
    roots: list[Node],
) -> list[Node]:
    def visit(
        node: Node,
        path: list[Node],
    ) -> list[Node] | None:
        current = path + [node]

        if node is target:
            return current

        for child in node.children:
            found = visit(child, current)

            if found:
                return found

        return None

    for root in roots:
        found = visit(root, [])

        if found:
            return found

    return [target]
