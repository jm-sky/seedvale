# Plan: Medicine targeted treatment for player, NPCs and livestock

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~items-player-021~~, ~~npc-025~~, ~~items-player-043~~
**Domain:** `items-player`
**Subdomains:** `player-needs` `items`
**Tags:** `medicine` `injury` `treatment` `livestock`
**Roadmap:** `physical-attributes-health-and-medicine`
**Model:** Sonnet, Composer

## Cel

Przygotować wspólny fundament physical-injury treatment dla Player/NPC/Animal, na którym `items-player-046` zbuduje player-facing Medicine targeted action.

Ten plan **nie dodaje jeszcze interakcji Medicine w Skills Screen**. Ma wyłącznie dostarczyć spójny stan urazu, shared treatment resolver i adaptery domenowe tak, aby późniejszy consumer nie musiał jednocześnie projektować modelu zdrowia.

## Stan obecny

- `src/shared/injurySeverity.ts` ma wspólne `InjurySeverity = none | minor | serious | critical` oraz accounting helpers.
- `src/shared/injuryRecovery.ts` ma `InjuryRecoveryState`, lazy recovery, `registerPhysicalInjuryFromDamage()` i `registerPhysicalInjuryFromHeal()`.
- NPC posiada authoritative `health`, `physicalInjury`, `injuryRecoveryUpdatedAtDays` i self-healing.
- Player posiada `HealthState`, ale nie posiada pełnego `physicalInjury` podłączonego do damage/healing.
- `AnimalAgent` posiada authoritative health; persisted livestock round-tripuje `AnimalSaveState`, ale nie posiada physical-injury state.
- `ITEM_CATALOG[kind].injuryTreatment` (`immediateHp`, `maxSeverity`) jest istniejącym source of truth dla materiałów leczących physical injury.
- `Inventory.findInjuryTreatment(severity)` jest istniejącym katalogowym selektorem treatmentu.
- `src/player/medicinalTreatmentEffectiveness.ts` ma bounded Medicine + Survival multiplier; może być reużyty przez player-facing flow w `046`, ale shared resolver z tego planu nie może zależeć od `PlayerSkills`.

## Decyzje

### 1. Jeden shared injury model

Player, NPC i Animal mają używać:

- `HealthState`,
- authoritative `physicalInjury`,
- `resolveInjurySeverity()`,
- `registerPhysicalInjuryFromDamage()`,
- `registerPhysicalInjuryFromHeal()`.

Nie tworzyć osobnych progów ani osobnego `LivestockHealthState`.

### 2. Shared treatment resolver jest pure

Dodać mały shared resolver physical treatment, niezależny od Player/NPC/Animal i inventory.

Resolver przyjmuje co najmniej:

- current `physicalInjury`,
- `maxHp`,
- requested treatment potency,
- optional maximum supported severity,
- treatment mode (`stabilize` albo `material`).

Zwraca deterministyczny wynik, np.:

- allowed/reason,
- requested HP restore po floor/clamp,
- resulting injury floor,
- whether material treatment is required.

Resolver **nie**:

- mutuje health,
- usuwa itemów,
- awarduje XP,
- czyta PlayerSkills,
- zna raycast/Interactable/UI.

### 3. Bare-hands stabilization policy

Zamknąć politykę już w tym planie:

- `critical` bez materiału można poprawić najwyżej do granicy `critical → serious`, używając istniejącego `criticalInjuryFloor(maxHp)`,
- `serious` bez materiału można poprawić najwyżej do granicy `serious → minor`, wyliczonej z istniejącego shared threshold, bez kopiowania magicznego `0.25`,
- `minor` może być leczone bez materiału aż do `none`, nadal ograniczone requested potency.

To są **floors**, nie gwarantowana ilość heal. Konkretna potency leczenia bez materiałów będzie dostarczana przez consumer (`046`).

### 4. Material treatment

`ITEM_CATALOG[kind].injuryTreatment` pozostaje source of truth:

```ts
injuryTreatment?: {
  immediateHp: number
  maxSeverity: TreatableInjurySeverity
}
```

`maxSeverity` jest hard requirement. Shared resolver nie zna `ItemKind`; otrzymuje już katalogowe metadata.

### 5. Player physical injury

Dodać authoritative `physicalInjury` i recovery anchor przy istniejącym player health ownerze.

Każdy zaakceptowany physical damage path gracza ma rejestrować **actual HP loss**, nie requested damage.

Physical wound treatment/recovery ma zmniejszać injury o **actual HP restored**.

Nie zmieniać automatycznie każdego generic `healHealth()` w wound treatment. Existing passive/generic HP recovery należy przejrzeć i jawnie zdecydować, czy jest natural injury recovery, czy tylko HP recovery.

### 6. Animal physical injury

Dodać `physicalInjury` + recovery anchor do `AnimalAgent` runtime state.

`takeDamage()` ma mierzyć actual HP loss i rejestrować injury tym samym shared helperem co NPC.

Livestock `AnimalSaveState` ma round-tripować authoritative injury amount i recovery anchor. Derived severity nie jest persistowane.

Wild fauna może mieć identyczny runtime field bez persistence; plan nie dodaje player-facing wildlife treatment.

### 7. NPC self-healing

Istniejący NPC decision/pressure/action flow zostaje bez redesignu.

`NpcAgent.beginHeal()` powinien użyć shared treatment resolvera dla suitability/potency/floor, ale zachować istniejący inventory owner i obecny orchestration. Ten plan nie naprawia niezależnych problemów ownershipu `carried` vs `personalInventory`.

Jeżeli zachowanie NPC ma pozostać dokładnie takie jak dziś, adapter może podać neutralną potency bez player Medicine scaling.

## Persistence

### Player

Aktualny player `HealthState` jest runtime-owned. Nie persistować samego `physicalInjury`, jeśli HP nie jest persistowane razem z nim.

W tym planie preferować **runtime-only player HP + injury**, jeżeli dodanie player-health save wymaga osobnej migracji/większego scope. Persistence player health może dostać osobny plan.

### NPC

Bez zmian schema poza reuse resolvera; istniejące `physicalInjury` i anchor pozostają authoritative.

### Livestock

Rozszerzyć istniejący `AnimalSaveState` oraz aktualny capture/hydrate pipeline. Brak drugiego save registry.

## Zakres implementacji

1. Pure shared physical-treatment resolver + testy.
2. Helper dla `serious → minor` floor oparty o istniejące injury thresholds, jeśli aktualne API go nie wystawia.
3. Player physical-injury runtime state i damage accounting.
4. Animal physical-injury runtime state i livestock persistence.
5. Reuse resolvera przez NPC self-healing bez zmiany decision architecture.
6. Aktualizacja state docs.

## Non-goals

Nie robić w `045`:

- `Medicine` consumer w `targetedSkillAction.ts`,
- Skills Screen zmian,
- self-treatment input/UX,
- player → NPC/livestock interaction,
- Busy Action,
- Medicine XP,
- medical tool capability,
- selection/consumption player treatment items,
- autonomous NPC doctor/healer,
- persistence player HP, jeśli wymaga osobnego większego scope,
- body-part wounds, bleeding, fractures, infection.

Wszystkie player-facing elementy przechodzą do `items-player-046`.

## Relevant files

- `src/shared/injurySeverity.ts`
- `src/shared/injuryRecovery.ts`
- `src/shared/HealthState.ts`
- `src/player/PlayerController.ts`
- player damage entry points wskazane przez current code
- `src/ai/NpcAgent.ts`
- `src/settlement/npcState.ts`
- `src/fauna/AnimalAgent.ts`
- livestock capture/save/restore seam używający `AnimalSaveState`
- `src/items/itemCatalog.ts`
- `src/items/Inventory.ts`
- `src/persistence/saveData.ts`

Dla nowych ważnych shared/public resolverów dodać JSDoc z `@domain`, rolą i invariants.

## Testy

### Shared treatment

- no injury → no effect,
- minor stabilization może dojść do 0,
- serious stabilization nie schodzi poniżej serious→minor floor,
- critical stabilization nie schodzi poniżej `criticalInjuryFloor(maxHp)`,
- material treatment z właściwym `maxSeverity` może przekroczyć stabilization floor,
- material treatment z niewystarczającym `maxSeverity` jest odrzucony,
- over-heal nie tworzy negative injury.

### Player

- accepted physical damage zwiększa HP loss i injury o ten sam actual delta,
- non-physical/generic HP path nie usuwa injury przypadkiem,
- runtime reset tworzy spójne full HP + zero injury.

### Animal / livestock

- `takeDamage()` zwiększa injury o actual HP loss,
- capture/hydrate round-tripuje injury i anchor,
- dead state nadal działa jak przed zmianą,
- wild fauna nie wymaga nowego persistence.

### NPC

- istniejący self-heal nadal wybiera treatment przez aktualny inventory flow,
- `maxSeverity` nadal jest respektowane,
- item konsumowany raz,
- HP i physicalInjury zmniejszają się o actual restored amount.

## Dokumentacja

Po implementacji zaktualizować:

- `docs/state/player-systems.md`,
- `docs/state/npc.md`,
- `docs/state/fauna.md`,
- `docs/items/CATALOG.md` tylko jeśli zmieni się publiczny contract treatmentu.

## Dependency contract dla `items-player-046`

`046` może zakładać po zakończeniu tego planu:

- Player/NPC/Animal mają dostępny spójny physical-injury model,
- żywy target może expose health + injury do cienkiego adaptera,
- istnieje pure resolver stabilization/material treatment,
- `ITEM_CATALOG.injuryTreatment` nadal jest source of truth,
- consumer musi jedynie wybrać target, competence/potency, materiał/tool i wykonać wynik.

> **Zrób git commit i push do main, rebase jeżeli trzeba**