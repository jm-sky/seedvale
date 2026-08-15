# Roadmap design sessions (frozen)

**Status:** frozen — historical record, not a live document. Not updated going forward.

This directory is **not** the product roadmap. That is [docs/ROADMAP.md](../ROADMAP.md) — the canonical, maintained document for product direction and milestones.

`docs/roadmap/` instead records three sequential design sessions (2026-08-12–2026-08-14) that established a *target system architecture*, used to evaluate the actual codebase in [review 006 — Architecture Alignment](../reviews/2026-08-14--006--architecture-alignment.md):

| File | What it is |
|---|---|
| `00-current-state.md` | Session 0 — repo-grounded starting point for the sessions. Superseded by [docs/STATE.md](../STATE.md), which is kept current; this file is not. |
| `01-vision.md` | Session 1 — vision framing accepted during the session. [docs/VISION.md](../VISION.md) is the canonical, maintained product vision. |
| `02-systems.md` | Session 2 draft. Superseded by `02-systems-fixed.md` below. |
| `02-systems-fixed.md` | Session 2 final accepted decisions — target system architecture/dependencies (`WorldContext`, ownership boundaries, hybrid simulation, etc.). The load-bearing file in this directory: it's what review 006 evaluated the codebase against. |

**If you're answering a target-architecture question, read [review 006](../reviews/2026-08-14--006--architecture-alignment.md) first** — it already synthesizes these sessions against the real codebase (current vs. target, gaps, severity, recommended actions), several of which have since been implemented (e.g. plan 069). Come back to `02-systems-fixed.md` only for the original accepted rationale behind a specific decision review 006 summarizes.

For current, maintained architecture, use [docs/ARCHITECTURE.md](../ARCHITECTURE.md). For current, maintained implementation state, use [docs/STATE.md](../STATE.md).
