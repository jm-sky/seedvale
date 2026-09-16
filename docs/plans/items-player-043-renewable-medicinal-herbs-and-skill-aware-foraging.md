# Plan: Renewable medicinal herbs and skill-aware foraging

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** items-player-021, npc-025
**Domain:** `items-player`
**Subdomains:** `items` `interaction` `player-needs`
**Tags:** `herbs` `medicine` `survival` `foraging` `respawn`
**Roadmap:** -
**Model:** Opus, Sonnet

## Goal

Rozdzielić obecne wielofunkcyjne `herb` na spójny mały system trzech ziół leczniczych:

- obecne `herb` pozostaje rzadkim ziołem questowym i silnym surowcem leczniczym,
- `mint` staje się pospolitym ziołem na zatrucia i przyszłe choroby,
- `yarrow` staje się pospolitym/umiarkowanie częstym ziołem na rany i opatrunki,
- wszystkie trzy zioła odrastają w świecie po czasie,
- `Survival` wpływa na odnajdywanie/zbieranie,
- `Medicine` wpływa na wykorzystanie lecznicze,
- ceny i występowanie wynikają z rzadkości oraz użyteczności.

System ma rozszerzać istniejące `ItemKind`, `ITEM_CATALOG`, chunk flora, temporary conditions, injury treatment, handel i player skills zamiast tworzyć osobny herbalism manager.

## Current state

Na obecnym `main`:

- `herb` jest jednym `ItemKind` używanym jednocześnie jako world forage, leczenie, merchant fallback i przedmiot questa `ziola-dla-anny`,
- `herb` ma `consumable.health = 8` i `conditionTreatment(poisoning) = 20`,
- quest `ziola-dla-anny` wymaga `herb ×3`,
- `herb` jest stockiem kupca po 5 coins wyłącznie jako reachability fallback,
- flora w `src/terrain/chunkItems.ts` jest deterministyczna, finite i po zebraniu trafia do `collectedItemIds`; obecnie nie ma respawnu,
- `Survival` i `Medicine` są już pełnoprawnymi `SkillId`,
- `src/player/skillEvaluation.ts` dostarcza `evaluateSkillCompetence(primary, support)` bez narzucania globalnego wzoru,
- katalog itemów posiada już niezależne `conditionTreatment` i `injuryTreatment`,
- `npc-025` dostarcza derived injury severity i katalogową ocenę suitability leczenia,
- obecny model temporary conditions implementuje wyłącznie `poisoning`; nie istnieje jeszcze generic disease system,
- istnieją `bandage` i mocniejszy `dressing`; obecny ekonomiczny/produkcyjny opis `dressing` zakłada przetworzenie `bandage + herb`.

## Core decisions

### 1. Zachować `herb` jako rzadki item

Nie zmieniać istniejącego `ItemKind` `herb` na `rare_herb`.

`herb` staje się semantycznie rzadkim ziołem leczniczym/questowym. Dzięki temu:

- istniejące save'y z `herb` pozostają kompatybilne,
- `ziola-dla-anny` nie wymaga migracji objective kind,
- istniejące household/production/trade references nie tracą itemu,
- nie trzeba mapować starego stacka `herb` do nowego rodzaju.

Zmienić label/opis tak, aby gracz rozumiał, że to zioło rzadkie, a nie ogólna kategoria wszystkich roślin leczniczych.

### 2. Dodać dwa zwykłe zioła

Dodać dwa nowe `ItemKind`:

```text
mint
    mięta
    częsta
    główny V1 use: poisoning / zatrucia

yarrow
    krwawnik
    częsty / umiarkowanie częsty
    główny V1 use: rany / opatrunki

herb
    rzadkie zioło lecznicze
    bardzo rzadkie
    silniejsze, wielozadaniowe
    pozostaje itemem questa
```

Nie dodawać teraz większej liczby gatunków.

## Natural occurrence

Rozszerzyć istniejący deterministic flora pool w `src/terrain/chunkItems.ts` zamiast tworzyć drugi generator roślin.

Docelowe preferencje V1:

### Mint

Najczęściej:

- wilgotne łąki / niskie, niezbyt suche tereny,
- okolice rzek, jezior i mokrych skrajów lasu, o ile current chunk data pozwala użyć istniejących moisture/biome signals bez dodatkowego world query,
- forest/swamp edge jako fallback.

Powinna być wyraźnie częstsza niż obecne `herb`.

### Yarrow

Najczęściej:

- łąki,
- polany,
- skraje lasu,
- suche/umiarkowanie wilgotne otwarte tereny poza pustynią i bagnem.

Nie przywiązywać jej do jednego rzadkiego biomu.

### Rare `herb`

Pozostaje rzadkie:

- forest floor,
- wilgotniejsze/shady miejsca,
- wyraźnie niższa waga niż mint/yarrow.

Nie gwarantować spawnów w konkretnym chunku ani obok questa. Quest zachowuje merchant fallback.

## Renewable flora / respawn

Obecne `collectedItemIds: Set<string>` oznacza permanent collection. Nie usuwać tego zachowania dla stone/shell/coin/pozostałych finite itemów.

Dodać mały renewable-item overlay wyłącznie dla rodzajów oznaczonych jako odnawialne.

Preferowany model:

```text
stable deterministic placement id
+ collectedAtGameDays dla renewable placement
+ per-kind respawnDays
→ placement available / unavailable
```

Po upływie czasu ten sam deterministic placement wraca. Nie losować nowego miejsca przy każdym respawnie.

Własność stanu pozostaje przy chunk-item lifecycle/persistence, nie przy renderowanym mesh ani timerze UI.

### Initial respawn tuning

Użyć jawnych centralnych wartości V1:

```text
mint   → 1.5 game days
yarrow → 2.0 game days
herb   → 7.0 game days
```

Wartości mają być łatwe do strojenia bez zmian w persistence shape.

Respawn ma działać także po unload/reload chunku oraz save/load.

## Persistence

Rozszerzyć obecny zapis collected world items tak, aby rozróżnić:

- permanent collected ids dla finite world items,
- renewable collected ids z timestampem czasu gry.

Nie zapisywać całych wygenerowanych placementów.

Preferować sparse mapę tylko dla aktualnie niedostępnych renewable placementów, np. semantycznie:

```text
renewableCollectedAt[id] = gameDays
```

Po wygaśnięciu respawn window wpis może zostać usunięty podczas normalnego resolve/load/chunk generation, aby save nie rósł bez końca.

Dodać migration/default dla istniejących save'ów. Stare `collectedItemIds` zachowują dotychczasowe znaczenie; nie próbować automatycznie odradzać historycznie zebranych `herb` bez jednoznacznego timestampu.

## Healing effects

### Mint

V1:

- `conditionTreatment.kind = poisoning`,
- słabsze leczenie niż rzadkie `herb`,
- minimalny albo brak zwykłego HP heal.

Punkt startowy:

```text
poisoning severityReduction base: 12
health relief: 0-3
```

Nie dodawać generic `disease` tylko po to, aby mięta miała drugie zastosowanie. Kiedy disease/illness condition zostanie zaimplementowane, mint ma być naturalnym pierwszym consumerem tego samego catalog-driven treatment modelu.

### Yarrow

V1 powinien wykorzystać istniejący wound/injury treatment model zamiast tworzyć bleeding status tylko dla tego itemu.

Punkt startowy:

```text
small health relief
injuryTreatment: minor/serious boundary odpowiedni do surowej rośliny
```

Krwawnik sam w sobie ma być słabszy od gotowego `bandage`/`dressing`. Jego główne znaczenie docelowe to składnik skuteczniejszego opatrunku.

Jeżeli current player self-treatment nie posiada authoritative physical-injury ownera równoważnego NPC `physicalInjury`, nie dodawać sztucznego player-only injury state. Dla Player V1 zastosować tylko efekty wspierane przez aktualny model i zachować `injuryTreatment` dla istniejących consumers.

### Rare `herb`

Obecny `herb` ma być wyraźnie mocniejszy niż mint/yarrow.

V1:

- zachować możliwość leczenia poisoning,
- zwiększyć potency względem pospolitej mięty,
- zachować mały bezpośredni health benefit,
- pozwolić mu uczestniczyć w istniejącym `dressing`/herbalist production path.

Nie dodawać uniwersalnego "cures everything" effect engine. Każdy efekt ma pozostać jawnie reprezentowany przez istniejące katalogowe capabilities.

## Skill integration

### Survival — odnajdywanie i zbieranie

`Survival` jest contextual skill i powinien wpływać na foraging bez twardego gate'a.

Nie robić:

```text
skill < threshold → roślina nie istnieje / nie można jej podnieść
```

Preferować łagodny, deterministyczny wpływ:

- zwiększony herb pickup/discovery prompt radius,
- lepsza identyfikacja ziół w UI, jeżeli istniejący interaction presentation pozwala to zrobić bez równoległego systemu wiedzy,
- XP po faktycznym zebraniu zioła, nie za samo zobaczenie/targetowanie.

Najniższy poziom Survival nadal pozwala znaleźć i zebrać każde zioło, jeśli gracz fizycznie je zauważy.

Nie skalować liczby fizycznie wygenerowanych roślin per-player skillem; świat ma być niezależny od gracza.

### Medicine — skuteczność leczenia

Przy użyciu medicinal herb wywołać istniejący `evaluateSkillCompetence()`:

```text
primary: Medicine
support: Survival
```

Consumer leczenia ustala efekt; nie zmieniać `skillEvaluation.ts` w globalny weighted-average framework.

V1 powinien użyć prostego deterministycznego bounded modifiera na katalogową bazową potency, np.:

```text
base catalog effect
× medicine effectiveness modifier
+ mały bounded support bonus z Survival
```

Wymagania:

- novice Medicine nadal daje użyteczne leczenie,
- mastery jest zauważalnie lepsze, ale nie podwaja/trivializuje leczenia,
- Survival jest wsparciem, nie zamiennikiem Medicine,
- outcome nie używa obowiązkowego random roll,
- skill effect resolver jest testowalny jako pure helper.

Punkt startowy do strojenia:

```text
Medicine multiplier: 0.85 → 1.20
Survival support: do +0.10 końcowego mnożnika
```

### XP

Dodać meaningful awards tylko za zakończone działania:

- zebranie medicinal herb → małe `Survival` XP,
- skuteczne zastosowanie medicinal treatment → `Medicine` XP,
- brak XP, gdy condition/injury nie istnieje i item nie daje realnego treatment effect.

Nie awardować XP per frame, za sam prompt ani wielokrotne targetowanie.

## Item presentation and interaction

Rozszerzyć istniejące:

- `src/items/items.ts`,
- `src/items/itemCatalog.ts`,
- inventory/action labels,
- world-item mesh/spawner mapping.

Każdy gatunek powinien mieć odróżnialny label i docelowo odróżnialny model/mesh. Jeżeli aktualnie nie ma assetów, reuse prostego placeholdera jest dopuszczalny tylko jako implementacyjny fallback; nie scalać gatunków w jeden label.

Nie tworzyć osobnego herb inventory/container systemu.

## Quest compatibility

`ziola-dla-anny` nadal wymaga:

```text
herb ×3
```

czyli rzadkiego zioła.

Mint i yarrow nie mogą spełniać tego objective.

Merchant fallback dla `herb` pozostaje, ale cena ma odzwierciedlać jego nową rzadkość i wysoką użyteczność.

## Economy

Initial V1 valuation:

```text
mint   → trade value 2 coins
yarrow → trade value 3 coins
herb   → merchant price / trade value 12 coins
```

- mint/yarrow nie muszą być stockiem generic merchant; naturalne zbieranie pozostaje podstawowym źródłem,
- `herb` pozostaje merchant stock jako quest reachability fallback,
- przy cenie `herb = 12`, zakup 3 sztuk jest świadomie kosztownym fallbackiem wobec quest reward,
- respawn rzadkiego `herb` musi być na tyle długi, aby nie tworzyć łatwej farmy pieniędzy,
- wszystkie wartości przechodzą przez istniejący `tradeCatalog` i sell-price/social-factor pipeline; nie tworzyć osobnego pricing table dla herbs.

Sprawdzić istniejące `dressing` value/production po zmianie wartości `herb`, aby koszt inputs/output nie generował oczywistego exploita ekonomicznego.

## NPC / settlement compatibility

Herbalist production już zna `herb` oraz `dressing`.

W tym planie:

- zachować istniejący `herb` jako valid rare ingredient,
- nie przebudowywać całej profesji herbalist,
- jeśli obecne recipe/duty hardcoduje `herb`, zmienić tylko tyle, aby jego nowa semantyka i ekonomia były spójne,
- nie dodawać automatycznie mint/yarrow do wszystkich household trade allowlists.

Przyszły plan może wykorzystać mint/yarrow w recipes i lokalnej produkcji bez zmiany ich world-resource ownership.

## Relevant files / integration points

Zweryfikowane punkty wejścia:

- `src/items/items.ts` — `ItemKind`, item definitions/weights,
- `src/items/itemCatalog.ts` — consumable, `conditionTreatment`, `injuryTreatment`, spawn metadata,
- `src/items/tradeCatalog.ts` — merchant price, resource value, stock,
- `src/terrain/chunkItems.ts` — deterministic flora placement and biome weights,
- `src/terrain/chunkManager.ts` — instantiated chunk items, `collectItem()`, collected-id filtering,
- `src/player/PlayerSkills.ts` — `Survival`, `Medicine`, XP owner,
- `src/player/skillEvaluation.ts` — primary/support competence seam,
- `src/app/actions/survivalActions.ts` — player consumable/condition treatment execution,
- `src/shared/temporaryConditions.ts` — poisoning state/effect,
- `src/shared/injurySeverity.ts` and npc-025 treatment consumers — injury suitability,
- `src/quests/quests.ts` — `ziola-dla-anny` objective,
- `src/persistence/saveData.ts` — chunk-item/persistence migration,
- household/herbalist production paths using `herb`/`dressing`,
- relevant item/trade/chunk/persistence/skills tests.

Implementation agent must verify exact current call-sites on HEAD before editing; current code wins over this list if paths moved.

## Implementation order

1. Add item kinds/catalog/trade values while preserving `herb` compatibility.
2. Split flora weighting into mint/yarrow/rare herb using current deterministic chunk generation.
3. Add renewable collection timestamps + persistence/migration and chunk filtering.
4. Add skill-aware herb discovery/pickup behavior through the existing interaction pipeline.
5. Add Medicine+Survival treatment effectiveness resolver and XP awards through existing skill APIs.
6. Reconcile quest, merchant fallback and herbalist/dressing economics.
7. Add focused unit tests and debug visibility needed for manual browser verification.

## Architecture guardrails

- World herb spawn/count never depends on Player skills or camera presence.
- Stable deterministic placement ids remain authoritative.
- Respawn is elapsed game-time based, not `setTimeout`/real-time based.
- Finite world items retain current permanent collection semantics.
- No `HerbManager`, `MedicineManager` or separate foraging state machine.
- Reuse `evaluateSkillCompetence`; do not add another skill-composition framework.
- Reuse `conditionTreatment` / `injuryTreatment`; do not create generic scripted item effects.
- Do not add `disease`/bleeding/infection state solely for herbs.
- Do not create player-only physical injury state for symmetry.
- Keep query/presentation separate from state mutation.
- Add JSDoc for important new public/shared renewable-resource and medicinal-effect helpers; use useful `@domain` / `@system` annotations for preflight discovery.

## Tests

### Flora

- same seed/chunk produces stable mint/yarrow/herb placement ids,
- mint is materially more common than rare `herb` under intended biome conditions,
- yarrow favors open non-desert/non-swamp terrain,
- rare `herb` remains possible but uncommon,
- home-chunk/current special exclusions remain unchanged unless explicitly required.

### Respawn

- collecting finite item still hides it permanently,
- collecting mint/yarrow/herb hides it until its respawn duration elapses,
- before threshold: unavailable,
- at/after threshold: same placement id is available again,
- unload/reload does not reset timer,
- save/load does not reset timer,
- expired renewable timestamps can be pruned safely,
- old save without renewable map loads correctly.

### Skills

- novice Survival never hard-blocks collection,
- higher Survival improves only the intended discovery/interaction parameter,
- collecting a herb awards Survival XP once,
- Medicine treatment uses `evaluateSkillCompetence` with Survival support,
- Medicine effectiveness is bounded and monotonic,
- treatment with no applicable condition does not farm Medicine XP.

### Treatment

- mint treats poisoning less strongly than rare `herb`,
- yarrow follows the existing injury-treatment capability where supported,
- rare `herb` retains stronger treatment,
- treatment stays catalog-driven rather than branching on `ItemKind` in condition/injury policy.

### Quest/economy

- `ziola-dla-anny` accepts `herb`, not mint/yarrow,
- `herb` remains merchant fallback,
- mint/yarrow are valued correctly,
- `herb` uses the new higher price,
- sell pricing continues through existing social-factor logic,
- dressing production/value remains economically sane after the rare-herb value change.

## Manual verification

Browser verification is performed by the User.

Verify manually:

- locate mint, yarrow and rare herb in their intended environments,
- collect each and confirm inventory labels,
- advance game time and verify staged respawn,
- save/load while a herb is waiting to respawn,
- compare low/high Survival discovery behavior through debug skill controls,
- poison Player, use mint and rare herb, compare treatment,
- verify Medicine progression/effect with low/high skill,
- verify quest still requires the rare `herb`,
- verify merchant price and buying fallback,
- verify existing bandage/dressing/herbalist flow has no regression.

## Non-goals

- generic disease framework,
- infection/bleeding condition system,
- alchemy/crafting UI,
- herb cultivation/farming,
- seasonal herb availability,
- NPC skill-based foraging,
- full herbalist profession redesign,
- procedural identification/minigame,
- randomized per-player herb spawning,
- generic renewable-resource rewrite for every world resource.

> **Zrób git commit i push do main, rebase jeżeli trzeba**