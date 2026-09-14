# Implementation Notes: ui-input-019

## Current ownership and existing seams

### Reputation

`src/reputation/ReputationManager.ts` already owns `SettlementSocialStanding` keyed by stable `settlementId`.

Useful reads:

```ts
getReputation(settlementId)
getRenown(settlementId)
```

The registry is intentionally sparse: absent entry means neutral reputation + zero renown. Do not enumerate `ReputationManager.exportState().settlements` to decide which settlements are known; that would conflate social changes with world knowledge.

### Character Screen reputation bridge

Current path:

```text
createApp.ts
→ hud.setCharacterReputation(...)
→ createHud.ts
→ Vue UI setCharacterReputation(...)
→ store.ts ui.characterScreen.reputation
→ CharacterScreen.vue
```

`CharacterReputationView` currently contains one `settlementName`, one reputation object and renown.

`createApp.ts` currently chooses a nearby/nearest loaded settlement when refreshing the screen. Replace the presentation-selection logic; do not move it into `ReputationManager`.

### Known settlements

`src/world/locations/locationKnowledge.ts` already owns player knowledge of concrete `WorldLocation`s:

```ts
get(id)
has(id)
list()
```

It is sparse and persisted/restored through the existing world-location pipeline.

`src/world/locations/locationProximityDiscovery.ts` already confirms a foreign village when the player physically arrives. Home village is explicitly confirmed at boot/New Game.

Use `LocationKnowledge` as the known/unknown gate.

Do not use map terrain Fog of War (`MapDiscovery`) as settlement knowledge.

## Resolve settlement ids outside Vue

Need a composition-layer projection from known village/world-location ids to:

```ts
{
  settlementId: string
  settlementName: string
}
```

Inspect the current world location catalog and village-location construction in `createApp.ts` / location catalog files. Do not assume `WorldLocation.id === settlement.id`; verify and keep explicit mapping if necessary.

Preferred presentation contract shape conceptually:

```ts
type CharacterSettlementOption = {
  settlementId: string
  settlementName: string
}

type CharacterReputationView = {
  settlements: readonly CharacterSettlementOption[]
  selectedSettlementId: string | null
  selected: {
    settlementId: string
    settlementName: string
    reputation: Reputation
    renown: number
  } | null
}
```

Alternative equivalent shapes are fine. Important constraints:

- stable id used for selection,
- only one standing payload needs to be rendered at once,
- known settlement list is presentation data, not authoritative state.

## Selection lifecycle

User requirement:

1. if currently in a settlement, default to it,
2. otherwise use the last visited/last active settlement,
3. allow manual selection of another known settlement.

First inspect whether current settlement/last visited settlement already exists in world/player state. Do not invent a new persisted field before recon.

### Current settlement

The existing code already computes settlement proximity for current reputation display. Reuse a coherent settlement-area/proximity helper if one exists rather than adding a Character-Screen-specific radius formula.

### Last visited

If there is no existing owner for last visited settlement:

- prefer a minimal app/world runtime field updated when proximity discovery confirms/enters a village,
- decide during implementation whether it needs persistence based on existing visit/location state semantics,
- at minimum preserve it through in-session screen reopen/world bundle rebuild if those flows would otherwise lose it.

Do not derive last visited from:

- `ReputationManager` sparse entries,
- nearest settlement after leaving a village,
- alphabetical order.

### Manual selection

Keep selection in UI/app presentation state. Selecting another village must not mutate player location, navigation target, settlement ownership or world state.

When the screen opens while physically inside a settlement, current-settlement precedence may reset selection to that settlement. Outside settlements, preserve/use last visited. This matches the requested default behavior while still allowing inspection of another village through the selector.

## Searchable combo

Check existing Vue components before adding a new primitive. Reuse any existing select/search/popover pattern if available.

If none exists, implement a small local Character Screen combo without dependencies:

- button/input showing selected settlement,
- simple text filter over known settlement names,
- keyboard/mouse usability consistent with current UI,
- deterministic ordering (prefer world/known ordering or name sort once resolved),
- modest list size; no virtualization needed unless current world scale proves otherwise.

Do not add a UI library for this.

## Refresh strategy

Current Character reputation is push/on-demand. Preserve that.

Relevant triggers to inspect:

- Character Screen open callback in `createApp.ts` / pause menu wiring,
- `applySocialConsequence` wrapper/callback that refreshes reputation after a quest/social event,
- village/location discovery callback if the screen can remain open while discovery changes.

Avoid rebuilding arrays every game-loop frame.

A useful split is:

- build known settlement options at screen open / discovery change,
- resolve one selected standing at screen open / selection change / social consequence affecting that settlement.

No need for a new worker or reactive world subscription.

## Quest choice clarity audit

Primary file:

- `src/quests/opportunities/rpgQuestMaterialization.ts`
  - `materializeSuspiciousTransport()`.

Observed semantics:

### `keep_quiet`

- giver relation `+2`,
- counterpart relation `-1`,
- trust `+1`,
- integrity `-1`,
- renown `+1`,
- hidden 8 coins.

### `report_it`

- counterpart relation `+2`,
- giver relation `-1`,
- integrity `+4`,
- courage `+2`,
- renown `+2`.

The mechanics can stay. Improve wording so the player understands the ethical direction before selecting it. Make `keep_quiet` read as consciously protecting/concealing an opaque arrangement, not merely respecting privacy. Make `report_it` clearly read as disclosure/accountability.

Search other current `talk_to_npc_choice` definitions/builders for similarly asymmetric social consequences. Only edit content where player intent and consequences are materially mismatched; do not rewrite all quest prose.

Do not introduce generated strings based on consequence dimensions. Authored wording should remain authored.

## Files to inspect/change

Primary UI/presentation:

- `src/ui-vue/store.ts`
- `src/ui-vue/screens/CharacterScreen.vue`
- `src/ui-vue/mount.ts`
- `src/ui/createHud.ts`
- `src/app/createApp.ts`

World knowledge / mapping:

- `src/world/locations/locationKnowledge.ts`
- `src/world/locations/locationProximityDiscovery.ts`
- world location catalog/types/builders used for village entries
- settlement manager/proximity helper used by current Character Screen refresh

Reputation source:

- `src/reputation/ReputationManager.ts` (likely no ownership change; only add read helper if genuinely useful)

Quest wording:

- `src/quests/opportunities/rpgQuestMaterialization.ts`
- `src/quests/quests.ts`
- other current builders returned by search for `talk_to_npc_choice` + social consequences

Tests:

- existing store/UI presentation tests if present,
- `ReputationManager.test.ts` only if its public read API changes,
- location knowledge/proximity tests for known village filtering/mapping seam if logic is extracted,
- quest materialization tests asserting exact choice text/outcome mapping where existing tests already cover the matrix.

## Pitfalls

- Do not leak every generated settlement by using settlement manager definitions directly without `LocationKnowledge` filtering.
- Do not list only settlements with non-zero reputation; known neutral settlements must be selectable.
- Do not use settlement display name as identity.
- Do not replace `LocationKnowledge` with `MapDiscovery`.
- Do not query `ReputationManager` from Vue.
- Do not make screen-open reputation refresh per-frame.
- Do not couple combo selection to active/current settlement simulation state.
- Do not expose raw future consequence numbers unless separately designed later.

## Suggested implementation order

1. Verify world-location ↔ settlement-id mapping and current/last settlement owner.
2. Define presentation types in `store.ts`.
3. Build known settlement options in `createApp.ts` using `LocationKnowledge` + catalog.
4. Implement current/last/fallback selection rules.
5. Wire selection callback through existing HUD/Vue bridge.
6. Add Character Screen searchable selector and single-standing rendering.
7. Wire social consequence/discovery refresh without per-frame work.
8. Audit/fix suspicious transport wording and only clearly similar cases.
9. Run targeted tests, typecheck/lint/build per repo instructions.

Browser verification belongs to the User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**