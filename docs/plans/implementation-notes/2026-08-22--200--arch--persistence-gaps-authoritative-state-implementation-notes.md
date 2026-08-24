# Implementation notes — 200 — Persistence Gaps & Authoritative State Completion

## 1. Findings matrix (plan §1)

Every 192–195 finding tagged persistence / state-continuity / reconstruction / deferred, cross-checked against 196–199 and current `main`:

| Finding | Plan | Current state on `main` | Covered by 196–199? | Decision |
|---|---|---|---|---|
| `PlayerNeeds.starvationDuration`/`.dehydrationDuration` not in `SavePlayerNeeds` | 195 finding P1 | Confirmed live (`src/player/PlayerNeeds.ts:27-28`; absent from pre-fix `SavePlayerNeeds`) | No — 197's own scope explicitly deferred it to 200 | **requires 200 — implemented this plan** |
| `Household.stock`/`.water` not carried across in-session `WorldBundle` rebuild | 195 finding B | Fixed | 197 §8 (`HouseholdSnapshot`, mirrors `EconomyRegistry`) | already fixed — no 200 work |
| `NpcAgent.die()` no death-propagation hook | 193 finding 2 | Addressed (deliberately no hook — no live consumer needs one) | 197 §6 | covered — no 200 work |
| NPC identity/runtime-state loss on settlement unload/reload, incl. death not surviving | 194 | Fixed | 197 (`NpcStateRegistry`) | already fixed — no 200 work |
| `ResourceDeposits` no carry-snapshot across rebuild | 193 finding 7 (unconfirmed) | Fixed (in-session only) | 198 | covered — no 200 work |
| `ResourceDeposits` cross-session (`SaveData`) persistence | 198 §8 (named "follow-up to 200") | Not implemented (in-session only) | Not 196-199 | **out of scope per 200's own "poza zakresem" list ("resource deposit continuity — 198")** — corrected in `LOOSE-ENDS.md` to redirect to 201 |
| Dropped instance-backed items lose durability/sharpness | 195 finding P0 | Fixed | 199 | already fixed — no 200 work |
| Time-skip double-counting NPC needs/economy | 192/193 | Fixed for the double-count; the underlying "should live-tick even freeze during a skip" design question is still open only as a documentation/behavior note | 196 | covered — explicitly out of scope for 200 ("time-skip architecture — 196") |
| `HeldTool.heldInstanceId` not persisted | 195 finding P3 | Open, accepted as intentional (same class as stamina) | n/a | not a 200 candidate — no world-behavior-changing loss, not part of the matrix's fix condition |
| `NpcAgent.beginOreGathering` `add()`-return-value gate | 195 (player/items cluster) | Open | n/a | not persistence/state-continuity — left in `LOOSE-ENDS.md` for 201 |

Only the starvation/dehydration duration gap meets plan 200's stated condition (loss/reset/misreconstruction that can change simulated behavior). Everything else in 192–195's persistence/continuity cluster is either already closed by 196–199, or explicitly out of 200's scope by the plan's own "poza zakresem" list.

## 2. Starvation / dehydration continuity (plan §2)

Classification: **authoritative simulation state**, not derived/transient — `PlayerNeeds.ts`'s own doc comment (lines 15-21) already states these are "simulation-time counters, not UI state."

```text
authoritative owner        PlayerNeeds.starvationDuration/.dehydrationDuration (player/PlayerNeeds.ts:27-28)
      ↓
mutation boundary          tickPlayerNeeds() every simulation tick (PlayerNeeds.ts:179-180)
      ↓
lifecycle boundary          none in-session — PlayerNeeds lives on `player`, not WorldBundle, so it is
                             untouched by settlement unload/reload, WorldBundle rebuild, or time-skip catch-up
      ↓
reconstruction source       only reconstructed on save load (restorePersistedNeeds)
      ↓
save boundary                was missing entirely — this is the actual gap
```

No other need timer/accumulator has the analogous bug: `stamina` is deliberately transient (documented, same as before); `hunger.current`/`thirst.current`/`vigor.current` were already persisted correctly. NPC needs (`ai/Needs.ts`) use an unrelated 0-1 "urge" shape with no duration-counter equivalent — out of this plan's scope anyway (player-only, plan 165).

Fixed the source of truth directly (no `NpcAgent`-style copy involved — this is player-only state with a single owner).

## 3. NPC reconstruction boundary (plan §3)

Not applicable — the only finding taken into 200 is player-only state with no `NpcAgent` analog. No NPC reconstruction path was touched.

## 4. Time-skip interaction (plan §4)

Not applicable — `starvationDuration`/`dehydrationDuration` live outside `WorldBundle` and are unaffected by streaming/rebuild/time-skip; `tickPlayerNeeds()` (the single mutator, gated on `dt`) is unchanged by this plan. No time-skip code was touched.

## 5. Save/load boundary (plan §5)

`starvationDuration`/`dehydrationDuration` require full save persistence (not runtime-continuity-only): they gate real HP loss (`playerDamage.ts:135-136`), so a save/reload mid-crisis previously reset the "how long has this been critical" clock to 0, silently pausing the HP-drain grace period — a save-scum-around-starvation-death bug (plan 195 finding P1, plan 165's documented deviation).

Added the minimal representation to the existing save model — `src/persistence/saveData.ts`:

- New `SavePlayerNeedsV27 = SavePlayerNeeds & { starvationDuration: number, dehydrationDuration: number }`.
- New `SaveDataV27` (bumps `playerNeeds` to the new shape), canonical `SaveData = SaveDataV27`.
- `isPlayerNeedsFieldV27`/`isSaveDataV27` validators (mirrors the `SavePlayerWell`/v23→v24 shape-change pattern — old `SavePlayerNeeds`/`isPlayerNeedsField` stay untouched for the v13-v26 chain).
- `toV27()` migration: pre-v27 saves default both fields to `0`, matching `createPlayerNeeds()`'s default (no fabricated retroactive crisis state).
- `upToCurrent`/`loadSaveData`'s full dispatch chain updated to wrap with `toV27(...)`.
- `SAVE_VERSION` bumped 26 → 27 (`src/app/saveState.ts`).
- `saveState.ts`'s `playerNeeds` assembly now includes both fields; `PlayerNeeds.ts`'s `restorePersistedNeeds` accepts and restores them (clamped `Math.max(0, ...)`, same defensive pattern as the existing three fields).

## 6. Authoritative vs. derived state (plan §6)

The fix stores the minimal authoritative counters themselves (already the case pre-fix, just unpersisted) — no derived/runtime copy was introduced, no new registry, no second source of truth. `deprivationSeverity()`/HP-loss gating still derive from these two numbers exactly as before.

## 7. Boundaries verified (plan §7)

Only the boundary actually relevant to this finding — save/load — was touched. `NpcAgent` dispose/recreate, settlement unload/load, and `WorldBundle` rebuild don't apply (no `NpcAgent`/`WorldBundle` involvement for this state); time-skip/catch-up doesn't apply (state lives outside the ticked-and-gated systems 196 covers).

## 8. Documentation (plan §8)

- `docs/STATE.md` — save schema version reference bumped v26 → v27.
- `docs/architecture/ARCHITECTURE.md` — "Save schema version history" table gains a v27 row; "Current schema version" bumped to v27.
- `docs/plans/LOOSE-ENDS.md` — checked off the starvation/dehydration entry (2026-08-22) with a fix summary; corrected the `ResourceDeposits` cross-session-persistence entry's stale "follow-up to 200" pointer to 201, since 200 explicitly scopes that out.
- `docs/plans/2026-08-19--165--vigor-hunger-thirst-and-rest.md` — added a short addendum marking its "Deviation — no persistence" note as historical/superseded.

## Tests

- `src/persistence/saveData.test.ts`: renamed all `isSaveDataV26` assertions to `isSaveDataV27` (loader now returns v27, mirrors the same mechanical rename every prior version bump in this file has required), updated `.version` literal assertions, added a `v26 → v27` migration test (defaults to 0) and a native-v27 round-trip test plus a malformed-field rejection test.
- `src/persistence/saveSlots.test.ts`: updated one stale `.toBe(26)` assertion (legacy-save migration target) to 27.
- `src/player/PlayerNeeds.test.ts`: added a `restorePersistedNeeds` describe block — round-trips both duration fields, and confirms the existing negative-value clamp pattern applies to them too.

## Verification

- `npx tsc --noEmit` — clean.
- `pnpm run lint:fix` — clean.
- `pnpm run test` — 185 files / 1645 tests passed.
- `pnpm run build` — clean (pre-existing chunk-size warning only, unrelated to this change).
- Browser verification: not performed by the agent per `CLAUDE.md` ("do not launch headless Chrome/Playwright yourself... ask the user to test the already-running dev server"). Manual check to confirm: get hunger/thirst critical long enough for `starvationDuration`/`dehydrationDuration` to start climbing (HUD shows the capability penalty), save, reload, and confirm HP-drain resumes immediately rather than after a fresh grace period.
