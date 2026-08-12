# 021 — Keep model and sound asset lists part of the development flow

**Status:** `done`

## Problem

New gameplay features can require new models and sounds, but these asset needs should be tracked explicitly instead of being discovered only during implementation or verification.

## Expected development flow

As part of feature development, always review and update the two project asset-list files:

- the list of required models,
- the list of required sounds.

When a feature needs a new model or sound, add it to the appropriate list during planning/implementation. If no new asset is needed, no entry is required.

## Goal

Make missing models and sounds a visible, planned part of normal Seedvale development rather than an afterthought.

## Resolution (2026-08-12)

Created living backlogs and wired them into agent/docs workflow:

| File | Role |
|------|------|
| [docs/assets/MODELS.md](../assets/MODELS.md) | Required / not-yet-wired models |
| [docs/assets/SOUNDS.md](../assets/SOUNDS.md) | Required / not-yet-wired sounds (seeded from research 007) |
| [docs/assets/README.md](../assets/README.md) | Folder index + development rule |

Also referenced from `CLAUDE.md` (Development + plan execution + docs table) and `docs/README.md`.

**Not done here:** acquiring or wiring any specific missing assets — only the tracking process.
