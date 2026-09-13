# Plan: Generic quest resolution effects

**Created:** 2026-09-13
**Status:** `planned` 📋
**Type:** refactor
**Priority:** high · **Effort:** M
**Model:** Composer, Sonnet
**Depends on:** none
**Domain:** `quests-progression`
**Subdomains:** `quests` `rewards`
**Tags:** `consequences` `persistence`
**Roadmap:** `quests-and-reputation.md`

## Goal

Rozdzielić **deklarację skutku** od **quest-id switcha w `createApp.ts`**. `QuestManager` ma zlecać istniejącym systemom (inventory, NPC inventory, fauna ownership, `LocationKnowledge`, carried containers) te same operacje, które dziś są zaszyte w `physicalOutcomeResolver` / `horseRewardAnimalId` / stage `effects`.

## Why

Lost hunter i treasure-map bear cave wymagają `if (questId === …)` w composition root. Kolejne plany (024–027) skopiują ten wzorzec. Koń jako nagroda to osobne pole `QuestDef.horseRewardAnimalId`, nie outcome effect.

Recon: `docs/reviews/2026-09-13--quest-system-architecture-recon.md` (P6, P7, Stage B).

## Non-goals

- Nowa waluta, EXP, skill tree.
- Przepisanie wszystkich authored `reward`/`consequences` na nowy union w jednym PR — stare pola mają pozostać cukrem.
- Work-contract posting jako effect (brak drugiego konsumenta).
- Skill XP effect, dopóki nie ma drugiego call site (books już uczą skilli poza questami).

## Current code

- `QuestReward` / `QuestConsequences` / `QuestStageEffect` w `src/quests/quests.ts`.
- `QuestManager.applyOutcome`, `selectStageDialogueAction`, injected `grantItem`, `transferAnimalOwnership`, `lifecycleHooks.revealLocation`.
- `src/app/createApp.ts` — `physicalOutcomeResolver.canResolve` / `onResolve` oraz `questLifecycleHooks.onStageAdvanced` dla lost hunter i bear cave.
- Dialogue action już ma `requireItemInstanceId`, `requireCarriedContainerId`, `requireCarriedUnopened`, `physicalOutcomeId`.

## Approach

1. Rozszerzyć `QuestStageEffect` (i analogiczny dispatch przy terminal outcome) o warianty, które mają **co najmniej dwóch** konsumentów albo natychmiastową migrację lost hunter + bear cave:
   - `reveal_location` (już jest)
   - transfer konkretnej `ItemInstance` do inventory giversa / zostawienie u gracza
   - `transfer_animal_ownership` (zastępuje pole na defie albo jest jedynym sposobem jego realizacji)
   - discard carried container + grant coins (payout zostaje wyliczony poza QuestManager, wstrzyknięty jak dziś grant)
2. `canResolve` fizyczny ma pozostać injected — sprawdza świat (czy gracz niesie instancję / zamkniętą trumnę). Nie przenosić ownership kontenerów do QuestManager.
3. Po migracji `createApp.ts` nie zawiera `questId === lostHunterBinding.questId` ani `TREASURE_MAP_BEAR_CAVE_QUEST_ID` w resolverze. Bindingi nadal dostarczają **wartości** (instanceId, containerId) do defa przy materializacji — to jest OK.
4. `applyOutcome` nadal exact-once; restore completed nie replayuje effectów.
5. Zachować `reward.items` + `consequences` jako istniejący sugar wywołujący ten sam dispatch.

## Persistence

Bez bumpa `CURRENT_SAVE_VERSION`, jeśli effecty są na definicji i aplikowane tylko przy pierwszym przejściu do terminal. Nie zapisywać „effectsApplied” osobno — terminal `resolvedOutcomeId` jest strażnikiem.

## Verification

- Testy lost hunter: return bow → instancja w `personalInventory` giversa, keep bow → zostaje u gracza; reload completed nie duplikuje.
- Testy bear cave: return unopened / keep opened bez gałęzi `questId` w teście composition — przez `QuestManager` + injected resolver.
- Regresja `QuestManager.test.ts` outcomes/rewards.

## Risks

- Zbyt szeroki union „na przyszłość”. Tylko warianty użyte przez migrację.
- Payout monet za zwrot trumny jest wyliczany z authored chest amount — zostawić wyliczenie w warstwie świata/bindingu, quest tylko woła `grantItem`.
