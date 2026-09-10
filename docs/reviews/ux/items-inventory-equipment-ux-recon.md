# UX Recon: Items, Inventory & Equipment

**Model:** Cursor — Grok
**Scope:** focused recon/review only; no implementation.

## Goal

Review the complete player-facing item lifecycle and determine whether ownership, use, equipment, requirements and transfers are understandable and consistent.

## Review scope

- world item discovery and pickup,
- pickup of multiple nearby items and ambiguous targets,
- inventory layout and item readability,
- stacks, item instances and quantities,
- held/equipped tool state,
- melee/ranged weapons and consumables,
- item use, consume, equip/unequip and contextual actions,
- loot from NPCs/animals/world containers,
- transfers between player inventory, containers, NPC/economy/trade flows where player-facing,
- capability-based requirements (`ITEM_CATALOG[kind].capabilities`) and how those requirements are communicated,
- feedback when an item/tool is missing, unsuitable or unavailable,
- consistency between inventory actions and direct world interactions,
- item information needed to make decisions: purpose, capability, quantity, condition where relevant and consequences of use,
- duplicated or ad-hoc item checks that bypass shared item/capability mechanisms.

## Key questions

- Does the player understand what they own and what is currently held/equipped?
- Is it obvious what each item can be used for?
- Are capability requirements communicated before failed attempts where practical?
- Are pickup, loot and transfer flows efficient when many items are involved?
- Are world actions and inventory actions consistent with each other?
- Does the implementation reuse `Inventory`, `HeldTool` and item catalog capabilities instead of introducing parallel rules?

## Output

Produce a concise review with concrete findings, affected files/systems, severity (`P0 blocker`, `P1 confusing`, `P2 friction`, `P3 polish`) and recommendations based on existing mechanisms. Separate UX problems from implementation/architecture problems.
