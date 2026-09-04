# Planning Guide

Rules for AI agents creating Seedvale plans and implementation notes.

- Next ideas: [NEXT-IDEAS.md](./NEXT-IDEAS.md)
- Loose ends: [LOOSE-ENDS.md](./LOOSE-ENDS.md)

## Next plan IDs

- ai: `005`
- fauna: `014`
- items-player: `017`
- npc: `018`
- persistence: `004`
- quests-progression: `001`
- settlements: `003`
- settlements-npcs: `024`
- tools: `013`
- ui-input: `008`
- world: `014`
- world-terrain: `011`

This ids section is maintained automatically from the plan files.

---

## Domains

| Domain | Covers | Subdomains |
|---|---|---|
| `ai` | AI-assisted dialogue, characterisation and related AI systems | `dialogue`, `characterisation`, `generation`, `agents` |
| `fauna` | Wildlife, predators/prey and ecosystem simulation | `predation`, `prey`, `habitat`, `reproduction`, `migration`, `lifecycle`, `population`, `domestication` |
| `items-player` | Player inventory, items, tools and item interaction | `inventory`, `items`, `tools`, `interaction`, `player-needs` |
| `npc` | NPC behaviour, needs, goals, traits, decisions and actions | `behavior`, `needs`, `goals`, `decision-making`, `relationships`, `memory`, `lifecycle`, `work`, `combat`, `dialogue` |
| `persistence` | Save data, storage, serialization and migrations | `save-data`, `serialization`, `storage`, `migration` |
| `quests-progression` | Quests, relationships, progression and rewards | `quests`, `relationships`, `progression`, `rewards` |
| `settlements` | Settlements, buildings, population, resources and development | `buildings`, `population`, `resources`, `development`, `economy` |
| `settlements-npcs` | Households, schedules, settlement NPCs and local economy | `household`, `schedules`, `economy`, `logistics`, `social` |
| `tools` | Development tools, diagnostics and automation | `debug`, `development`, `diagnostics`, `automation` |
| `ui-input` | UI, HUD, input and player interaction | `hud`, `menus`, `input`, `interaction`, `feedback` |
| `world` | World state, resources, places, time, weather and simulation | `resources`, `places`, `time`, `weather`, `events`, `simulation` |
| `world-terrain` | Terrain, chunks, vegetation, roads and world rendering | `terrain`, `chunks`, `vegetation`, `roads`, `landmarks`, `rendering` |

Use the existing domain that best owns the work. Do not create a new domain for a single plan.

## Plan Metadata

Every plan starts with:

```md
# Plan: <name>

**Created:** YYYY-MM-DD
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** S
**Depends on:** ~~005~~ ~~008~~
**Domain:** `npc`
```

Required fields: `Created`, `Status`, `Type`, `Priority`, `Effort`, `Depends on`, `Domain`.

Optional metadata may help AI preflight:

```md
**Subdomains:** `household` `logistics`
**Tags:** `delivery` `inventory`
**Roadmap:** `npc-ai.md`
```

Optional fields: `Subdomains`, `Tags`, `Roadmap`, `Implemented at`.

Closed vocabularies — Status: `draft`, `planned`, `in progress`, `verification needed`, `done`; Type: `feature`, `bug`, `fix`, `polish`, `optimization`, `refactor`, `infrastructure`; Priority: `high`, `medium`, `low`; Effort: `XS`, `S`, `M`, `L`, `XL`.

Keep `Subdomains` and `Tags` short and relevant. They are hints for navigation/preflight, not a replacement for code recon.
Optional `Roadmap` should point to a file in `docs/roadmap` folder. See `docs/plans/PLAN-METADATA.md` for the full contract, including per-field semantics and consumers.

Write complete, correct metadata — don't rely on repair. `pnpm plans:sync` (and `pnpm docs:sync`) best-effort repairs missing/malformed/conflicting metadata in place (e.g. a filename-implied `Domain`, a `Depends on: 001` local ID resolved against the current domain) rather than failing the pipeline; see `docs/plans/PLAN-METADATA.md` §18 for exactly what it infers, defaults, or leaves as a warning.

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
