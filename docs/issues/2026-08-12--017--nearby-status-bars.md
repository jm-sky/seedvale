# 017 — NPC/mob status bars only when nearby

**Status:** `done`

## Problem

NPC and mob status bars (HP, stamina and similar runtime state) should not be visible across the world. Showing bars for every loaded entity creates unnecessary screen clutter.

## Expected behaviour

- Show status bars only when the player is within a suitable proximity threshold.
- Hide them again when the player moves away.
- Apply the same visibility rule consistently to NPCs and fauna/mobs.
- Preserve existing status-bar content and state; this is a visibility/distance change, not a new health system.

## Goal

Keep the world readable and avoid HUD-like clutter while still making nearby entities inspectable.
