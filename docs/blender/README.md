# Seedvale Blender / MPFB2 Knowledge Base

AI-oriented knowledge base for the Seedvale character production pipeline.

## Scope

- Blender 5.2 Python/API usage relevant to character production.
- MPFB2 character generation and asset handling.
- Seedvale-specific character rules and pipeline conventions.
- Recipes for repeatable Blender/MPFB2 operations.
- Troubleshooting and verified discoveries.

## Source priority

1. Current Seedvale code and helper implementations.
2. Blender 5.2 official API/documentation.
3. Current MPFB2 source and official MPFB2 documentation.
4. Verified Seedvale Blender sessions.
5. Community examples/tutorials.

When sources disagree, prefer the higher-priority source and record the discrepancy instead of guessing.

## Documents

- `AI_WORKFLOW.md` — operating rules for Claude Code + Blender MCP.
- `BLENDER_5_2_REFERENCE.md` — Blender 5.2 API/export notes.
- `MPFB2_REFERENCE.md` — MPFB2 architecture and API concepts.
- `MPFB2_RECIPES.md` — repeatable operations and recipes.
- `SEEDVALE_CHARACTER_RULES.md` — Seedvale-specific asset and optimization contracts.
- `TROUBLESHOOTING.md` — known failures and fixes.
- `VERIFIED/` — procedures explicitly tested in Blender/MPFB2.

## Status vocabulary

- `researched` — supported by current documentation/source research.
- `verified` — tested in the stated Blender/MPFB2 environment.
- `assumption` — useful working hypothesis; must not be treated as fact.
- `obsolete` — retained only to explain a superseded approach.

Do not promote `researched` or `assumption` material to `verified` without actually testing it in Blender.
