# Planning Guide

Rules for AI agents creating Seedvale plans and implementation notes.

- Next ideas: [NEXT-IDEAS.md](./NEXT-IDEAS.md)
- Loose ends: [LOOSE-ENDS.md](./LOOSE-ENDS.md)

## Next plan IDs

- ai: `005`
- fauna: `005`
- items-player: `012`
- npc: `009`
- persistence: `002`
- quests-progression: `001`
- settlements: `003`
- settlements-npcs: `018`
- tools: `008`
- ui-input: `007`
- world: `009`
- world-terrain: `004`

This ids section is maintained automatically from the plan files.

---

## Domains

| Domain | Covers |
|---|---|
| `ai` | AI-assisted dialogue and characterisation |
| `fauna` | Wildlife and ecosystem simulation |
| `items-player` | Inventory, tools, player items and needs |
| `npc` | NPC behaviour, needs, goals, decisions and actions |
| `persistence` | SaveData and persistence |
| `quests-progression` | Quests, relationships, EXP and progression |
| `settlements` | Settlements, buildings, population and development |
| `settlements-npcs` | Households, schedules, economy and NPC-settlement integration |
| `tools` | Development and debugging tools |
| `ui-input` | UI, HUD, input and player interaction |
| `world` | World state, resources, places, time and weather |
| `world-terrain` | Terrain, chunks, ocean and environment |

Use the existing domain that best owns the work. Do not create a new domain for a single plan.

## Plan Metadata

Every plan starts with:

```md
# Plan: <name>

**Created:** YYYY-MM-DD
**Status:** `planned` 📋
**Priority:** medium · **Effort:** S
**Depends on:** ~~005~~ ~~008~~
**Domain:** `npc`
```

Required fields: `Created`, `Status`, `Priority`, `Effort`, `Depends on`, `Domain`.

Optional metadata may help AI preflight:

```md
**Subdomains:** `household` `logistics`
**Tags:** `delivery` `inventory`
**Roadmap:** `npc-ai.md`
```

Keep `Subdomains` and `Tags` short and relevant. They are hints for navigation/preflight, not a replacement for code recon.
Optional `Roadmap` should point to a file in `docs/roadmap` folder. 

## Creating a Plan

Before writing a plan:

1. Read this file and the relevant `docs/STATE.md` sections.
2. Recon the current codebase and identify existing mechanisms to reuse.
3. Check related plans and dependencies.
4. Define the smallest coherent scope, constraints, non-goals and verification.

A plan describes **what and why**, not a line-by-line implementation.

Do not assume that a plan, roadmap item or documentation matches the current code. The repository is the source of truth.

## Implementation Notes

Implementation notes are written **for the AI implementation agent**. Their purpose is to save Claude Code time, context and tokens by removing unnecessary repository rediscovery.

For:

`docs/plans/<plan>.md`

create:

`docs/plans/implementation-notes/<plan>-implementation-notes.md`

Before writing them, inspect the current codebase and record only implementation-relevant findings:

- read `docs/STATE.md`,
- exact relevant files and symbols,
- ownership and lifecycle boundaries,
- existing mechanisms to reuse,
- integration points,
- important dependencies and constraints,
- architectural decisions and pitfalls,
- useful implementation order where non-obvious.

Do not copy the plan, source code or obvious instructions.

Quality test:

> Would Claude otherwise need to inspect multiple files or trace relationships to discover this?

If not, omit it.

If the plan conflicts with the current code, document the discrepancy and follow the current architecture rather than forcing the code to match the plan.

## AI Preflight

`scripts/claude/pre-implementation.ts` produces a bounded implementation briefing. `Domain`, `Subdomains` and `Tags` may improve its relevance.

When creating a plan, add an implementation instruction to add JSDoc for important architectural/public functions and classes when needed for preflight discovery. Suggest using the `@domain` tag.

Keep the distinction:

- **Plan** — what and why.
- **Preflight** — where to look.
- **Implementation notes** — what to reuse and what matters there.

## Automatic Updates

Derived plan information must be updated automatically. In particular:

- next plan IDs,
- plan indexes,
- recently completed plans,
- implementation-notes presence.

Update the generator, not generated content.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
