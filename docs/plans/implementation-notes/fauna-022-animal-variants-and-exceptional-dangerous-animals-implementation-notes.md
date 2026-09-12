# Implementation Notes: fauna-022 Animal Variants & Exceptional Dangerous Animals

## Najważniejsze ustalenia z codebase

- `AnimalKind` / `AnimalDef` w `src/fauna/animalDefs.ts` są poprawnym species-level ownerem. Nie dodawać `alpha_wolf` ani wariantowych capability do `AnimalDef`.
- `AnimalAgent` już ma **równoległy, starszy mechanizm wyjątkowego osobnika**: `dangerous` + `markDangerous()` (`DANGEROUS_HP_MULTIPLIER = 2`, damage `2`, scale `1.25`, tint, label). Jest używany przez `kill_target_animal { dangerous: true }`. Fauna-022 nie powinna zostawić obok niego drugiego niezależnego systemu mnożników.
- `markDangerous()` obecnie podbija HP, scale i damage vs human/NPC, ale animal→animal nadal wywołuje czyste `damageFor(this.def.kind, target.def.kind)`. To ważna niespójność przy konsolidacji: alpha ma modyfikować oba outgoing damage paths.
- `frenzied` i `rabid` są osobnymi runtime states w `AnimalAgent`; nie łączyć ich z variant. Rabies może być persistowane tylko dla tych klas zwierząt, które już używają `AnimalSaveState`; ordinary wild fauna nadal nie jest snapshotowana.

## Zalecany kształt implementacji

### 1. Jeden fauna-owned resolver wariantu

Dodać mały moduł, np. `src/fauna/animalVariants.ts`, bez Three.js i bez zależności od questów:

- `AnimalVariant = 'normal' | 'alpha'`;
- tabela definicji wariantów;
- pure/O(1) helpery lub jeden `resolveAnimalVariantStats(def, variant)` zwracający mnożniki HP/damage/speed/scale/danger + darkening.

`AnimalAgent` powinien dostać `variant?: AnimalVariant` w `AnimalAgentDeps`, z defaultem `normal`, oraz publiczny readonly getter/pole do odczytu `variant` i `dangerSignificance` przez kill-context. Nie mutować `AnimalDef` ani globalnych `MAX_HP`/damage tables.

Efektywne wartości rozstrzygać w jednym miejscu:

- constructor health: `MAX_HP[def.kind] * healthMultiplier`;
- `walkSpeedNow()` / `sprintSpeedNow()`: istniejąca species/night logic × variant speed multiplier;
- animal→animal: `damageFor(...) * damageMultiplier`;
- animal→human/NPC: `damageVsHuman(...) * damageMultiplier`.

Nie cache'ować dynamicznie co tick; variant jest immutable, więc można przechować gotowe mnożniki/resolved stats na agencie.

### 2. Skonsolidować istniejący `markDangerous()` zamiast dublować system

To największa pułapka planu. Obecny questowy `dangerous` robi niemal dokładnie to samo co nowy variant. Najmniejsza spójna zmiana:

- zachować publiczne `markDangerous()` i istniejący quest injection contract, żeby nie ruszać `QuestManager`/`createApp`;
- przenieść jego stat/presentation tuning na ten sam mechanizm per-animal modifierów używany przez variants albo zamienić ten legacy trait na jawny resolved modifier;
- nie pozostawiać osobnych `DANGEROUS_*` branchy w combat obok `variant === 'alpha'` branchy.

Nie należy automatycznie utożsamiać `dangerous` z `alpha`: questowy trait jest nakładany po bindzie na wybranego istniejącego wilka, alpha jest deterministyczną cechą spawn slotu. Jeśli oba trafią na ten sam agent, trzeba zdefiniować jeden sposób composition; rekomendacja V1: **nie mnożyć bonusów podwójnie**. Resolver powinien wybrać silniejszy effective modifier albo `markDangerous()` powinien być no-op dla już wyjątkowego wariantu poza questowym label/oznaczeniem.

### 3. Wolf-den alpha assignment: użyć slotu packa, nie `animalId`

Aktualny `createFauna.ts`:

- tworzy `PreySpawner.id` jako `${settlementId}:wolfDen` przez `spawnerId()`;
- `WOLF_DEN_ID = 'wolf-den'` jest quest-facing aliasem, **nie faktycznym `spawnPointId` zwierzęcia**;
- initial ordinary habitat fill iteruje `for (let i = 0; i < ordinary; i++)` i dopiero tam tworzy den wolves;
- `spawnAgent()` nadaje ordinary wild `animalId` z globalnego per-build licznika `${kind}-${nextAnimalId++}`.

Nie wybierać alfy przez aktualne `animalId`: licznik zależy od wcześniejszych spawnów i może zmienić się po niezwiązanych zmianach worldgen/fauny. Dla `wolfDen` przypisać alpha bezpośrednio z deterministycznego **slot indexu w initial fill**, np. slot `0`; variant przekazać do `spawnAgent()`/`AnimalAgentDeps`.

To daje dokładnie jedną alfę przy obecnym `wolfDen.maxPreyCount = 2`, bez dodatkowego RNG i bez zmian `spawnPointId`, depletion ani `denWolfAnimalIds`.

`wolfDen` ma `respawnIntervalDays: Infinity`, więc nie trzeba projektować alpha respawnu. Generic `updateSpawners()` nie odtwarza tego packa.

### 4. Persistence

Nie dodawać `variant` do `AnimalSaveState` dla alpha V1.

Ordinary wolf-den wolves są ordinary wild fauna: codebase nie snapshotuje ich per individual. Spawner persistence zapisuje tylko lifecycle (`state`, `deathsThisCycle`, itd.). Alpha może być odtworzona z `wolfDen` + initial slot.

Uwaga: obecny system przy reload/rebuildzie aktywnego den ponownie wykonuje ordinary initial fill; plan nie powinien przy okazji naprawiać/zmieniać tej semantyki. Variant assignment ma jedynie być stabilny względem istniejącego lifecycle.

Jeśli później variant trafi do `PersistentOccupantDecl`/livestock/rats, wtedy dopiero potrzebny będzie jawny save contract lub deterministyczne declaration metadata.

## Presentation

- `createFauna.ts::spawnAgent()` klonuje template przez `wrapModel(tpl.clone())`, więc modyfikacja skali konkretnego roota jest per-agent.
- Juvenile scale jest dziś nakładany w constructorze przez `mesh.scale.multiplyScalar(JUVENILE_SCALE_FACTOR[def.kind] ?? 1)`. Variant scale zastosować również raz podczas konstrukcji, dając faktyczne composition `template/base × juvenile × variant` bez resetowania scale.
- Do tint/darkening wykorzystać istniejące `tintPropMaterials()` (`src/settlement/propUtils.ts`): helper klonuje materiały przed zmianą, więc nie mutuje współdzielonego GLTF material cache. Nie pisać drugiego traversala/material-clone helpera.
- `visualDarken: 0.20` jest semantycznym współczynnikiem, podczas gdy `tintPropMaterials()` przyjmuje docelowy hex. Resolver/presentation helper powinien mieć jedno jawne przeliczenie albo alpha-specific tint constant; nie mutować color kolejny raz co tick.
- Corpse lifecycle również używa `tintPropMaterials()` dla rot/bones. Variant tint nie może zakładać, że jego kolor pozostanie authoritative po zmianie corpse phase.

## Combat / movement integration

Nie zmieniać `faunaCombat.ts` tables — `MAX_HP`, `DAMAGE_TABLE`, `HUMAN_DAMAGE` pozostają species baseline.

W `AnimalAgent` są trzy realne outgoing seams do pokrycia:

1. animal target: `target.takeDamage(damageFor(this.def.kind, target.def.kind))`;
2. player: `damageVsHuman(this.def.kind)` w human-hit path;
3. NPC: ten sam `damageVsHuman(this.def.kind)` w NPC-hit path.

Wszystkie trzy powinny czytać ten sam effective damage multiplier. Dzięki temu alpha, future variants i legacy dangerous modifier nie rozjadą się ponownie.

Speed multiplier najlepiej składać wewnątrz `walkSpeedNow()` / `sprintSpeedNow()` po istniejącej night/prey korekcie, zamiast mnożyć `def.walkSpeed` przy każdym call-site. Wolf alpha nie dotyka mount speeds.

## Danger significance / quests-progression-019

`quests-progression-019` już ma `Depends on: fauna-022` i oczekuje `PlayerAnimalKillContext.dangerSignificance`.

Fauna-022 powinna wystawić tylko mały read seam z agenta, np. `animal.dangerSignificance` / `getDangerSignificance()`. Nie importować reputation/quests do fauna variant resolvera.

Nie rozszerzać ogólnego `onAnimalDeath(animalId)` o variant. Ten hook jest cause-independent. `quests-progression-019` ma przechwycić significance dopiero w istniejącym player-caused melee/ranged finalization path.

Legacy `dangerous` quest trait wymaga decyzji: generic deed i quest suppression nadal należą do `quests-progression-019`; fauna ma jedynie zwrócić effective significance osobnika. Nie hardkodować quest IDs ani suppression w variants.

## Testy o najwyższej wartości

Priorytetowo testować pure resolver + realne seams, nie snapshoty implementacyjne:

- `normal` daje neutralne mnożniki; alpha daje tuning z planu;
- initial `wolfDen` fill: slot 0 alpha, pozostałe normal, oba `kind === 'wolf'` i ten sam realny `spawnPointId` den;
- assignment nie zależy od `nextAnimalId` ani wcześniejszych ring spawnów;
- max HP alpha pochodzi z species baseline × variant;
- oba damage paths (`damageFor`, `damageVsHuman`) dostają ten sam variant multiplier;
- `walkSpeedNow`/`sprintSpeedNow` zachowują dotychczasowe species behaviour dla normal;
- `frenzied` i `rabid` nie zmieniają variant i odwrotnie;
- alpha tint nie zmienia materiału normalnego wilka;
- legacy `markDangerous()` nie powoduje przypadkowego podwójnego stackowania na alpha.

## Pliki / symbole do zmiany lub ponownej weryfikacji podczas implementacji

- `src/fauna/animalDefs.ts` — tylko typ `AnimalKind`/species baseline context; nie wkładać tu per-individual variant state.
- `src/fauna/AnimalAgent.ts` — `AnimalAgentDeps`, constructor health/presentation, `walkSpeedNow()`, `sprintSpeedNow()`, trzy outgoing damage seams, `markDangerous()`, read-only danger significance.
- `src/fauna/faunaCombat.ts` — pozostawić baseline tables; co najwyżej test/import helperów.
- `src/fauna/createFauna.ts` — `spawnAgent()` + ordinary habitat fill; tu należy nadać alpha slot dla `wolfDen`.
- `src/fauna/AnimalSpawner.ts` — bez nowego lifecycle; zachować `PreySpawner`, depletion i `WOLF_DEN_ID` alias semantics.
- `src/fauna/wolfDenScenario.ts` — pressure/humanTaste pozostają orthogonalne do variant.
- `src/settlement/propUtils.ts::tintPropMaterials()` — istniejący bezpieczny material-clone/tint helper do reuse.
- `src/quests/QuestManager.ts` / `src/app/createApp.ts` — zachować istniejący `markDangerous()` injection contract; zmieniać tylko jeśli konsolidacja wymaga mechanicznej adaptacji.
- `docs/plans/quests-progression-019-dangerous-animal-deeds-local-reputation.md` — downstream consumer significance; nie implementować reputation w tym planie.

## Kolejność implementacji

1. pure variant type/defs/resolver;
2. `AnimalAgentDeps` + effective HP/damage/speed + presentation;
3. skonsolidować legacy `markDangerous()` z tym samym modifier path;
4. deterministic wolf-den slot assignment w `createFauna.ts`;
5. read seam `dangerSignificance`;
6. targeted tests + aktualizacja `docs/state/fauna.md`.

## What was implemented

- `src/fauna/animalVariants.ts` — `AnimalVariant` / defs / `resolveAnimalVariantStats` (max-compose with `DANGEROUS_TRAIT_MODIFIERS`) / `wolfDenInitialFillVariant` / `variantTintHex`.
- `AnimalAgent` takes `variant?: AnimalVariant` (default `normal`), stores immutable `variant` plus resolved `effective` multipliers, exposes `dangerSignificance`, `outgoingDamageFor`, `outgoingDamageVsHuman`.
- Construction HP/scale/tint and `walkSpeedNow`/`sprintSpeedNow` read the resolved multipliers. All three outgoing attack paths share the damage methods.
- `markDangerous()` recomputes via the same resolver (no second `DANGEROUS_*` combat pipeline) and still applies the quest label + dedicated tint.
- `createFauna` ordinary habitat fill: `wolfDen` slot 0 is alpha; other slots and other habitats stay normal. No `AnimalSaveState.variant`.
- Tests: `animalVariants.test.ts` + wolf-den pack assertion in `createFauna.test.ts`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
