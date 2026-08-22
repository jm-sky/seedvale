# Architecture

This directory contains documentation describing **how Seedvale is architected**.

It covers system boundaries, ownership, contracts, lifecycle, dependencies, runtime composition, rendering architecture and other technical design decisions that shape the implementation.

## This directory contains

- architecture maps and system boundaries,
- ownership and lifecycle rules,
- technical contracts and invariants,
- cross-system dependencies,
- rendering and graphics architecture,
- durable architectural decisions.

## This directory does not contain

- **Product vision** — see [`../VISION.md`](../VISION.md) and [`../vision/`](../vision/).
- **Project roadmap** — see [`../ROADMAP.md`](../ROADMAP.md) and [`../roadmap/`](../roadmap/).
- **Current implementation state** — see [`../STATE.md`](../STATE.md) and [`../state/`](../state/).
- **Implementation plans** — see [`../plans/`](../plans/).

## Source of truth

Architecture documentation describes intended and observed architectural structure, but the **current code is the final source of truth**.

When documentation and implementation disagree:

1. verify the current code,
2. determine whether the code or documentation is incorrect,
3. update the documentation when the architectural decision remains valid.

Architectural changes should be deliberate and should avoid unnecessary duplication, parallel mechanisms and unrelated refactors.
