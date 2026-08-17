# Implementation notes: Pułapki na zwierzęta

**Plan:** [141 — Pułapki na zwierzęta](./2026-08-17--141--animal-traps.md)
**Created:** 2026-08-17
**Status:** `verification needed` 🔍 — zrealizowane; rozstrzygnięcia i odstępstwa opisane w sekcji „Stan implementacji” planu

## Review summary

Plan 141 jest kierunkowo zgodny z aktualną architekturą Seedvale, ale przed implementacją trzeba doprecyzować kilka miejsc. Najważniejsza uwaga: **nie budować pułapek jako nowego globalnego managera ani jako per-frame systemu skanującego faunę**. Pułapka powinna być małym persisted world objectem, a integracja z `AnimalAgent` powinna korzystać z istniejących lifecycle/death/loot/interactions.

Aktualny kod potwierdza, że:

- `PlayerSkills` ma już tylko `sneak` i `survival`; `SkillId` trzeba rozszerzyć o `traps`, a istniejąca krzywa `xpToSkillValue()` jest wspólna dla skills. `xp` jest jedynym źródłem progresu. Nie twórz osobnej krzywej dla `Traps`.
- `AnimalAgent` ma własny lifecycle życia/śmierci oraz hooki związane ze spawn pointami. Śmierć po złapaniu powinna przejść przez ten sam lifecycle, nie przez ręczne usuwanie agenta.
- Harvest mięsa jest już gatunkowo mapowany do `deer_meat`, `boar_meat`, `rabbit_meat`, itd., a `hide` jest obecnie byproductem harvestu. Plan 141 nie powinien kopiować tej logiki.
- `ITEM_CATALOG` jest rozszerzalny o nowe `ItemKind`, ale pułapka nie musi być `HeldTool`; traktować ją raczej jako inventory item + placed world object.
- Weather jest deterministyczne z `(worldSeed, elapsedDays)`, bez historii runtime i bez save field. Nie dodawaj osobnego weather state tylko dla trapów.
- `WorldBundle` jest granicą lifetime world systems. Każdy nowy runtime subsystem musi respektować rebuild/lifetime invariant.

## 1. Najważniejsza korekta modelu stanu

Plan używa nazwy `used` w znaczeniu „rozłożona, ale nieaktywna”. To jest semantycznie mylące, ponieważ `used` sugeruje pułapkę już wykorzystaną.

Jeżeli istniejący kod nie wymusza nazwy, preferowane jest:

```ts
export type TrapState = 'placed' | 'active' | 'broken'
```

`placed` = rozłożona/dezaktywowana i gotowa do ponownej aktywacji.

Jeżeli nazwa `used` zostanie zachowana dla zgodności z planem, koniecznie opisać ją w jednym miejscu jako `placed but inactive`, aby agent nie zaczął traktować jej jako jednorazowo zużytej.

Po udanym capture:

- jeśli pozostała trwałość > 0 → `placed`;
- jeśli durability spadła do 0 → `broken`.

Dezaktywacja nie zmienia durability.

## 2. Pułapka nie powinna trzymać referencji do PlayerController

To ważne dla world independence.

Pułapka może działać, gdy gracz jest daleko, a `PlayerController` może zostać przebudowany razem z world bundle. Nie przechowuj w trap runtime object referencji do gracza ani `PlayerSkills`.

Rekomendowane rozwiązanie:

- przy **aktywacji** odczytaj aktualne `PlayerSkills.traps.value`;
- zapisz wynik jako małą wartość snapshotową w stanie pułapki, np. `skillValueAtActivation`;
- detection używa tej wartości, również gdy gracz odejdzie.

Dzięki temu pułapka jest autonomicznym world objectem. Jednocześnie skill faktycznie wpływa na skuteczność pułapki w momencie jej ustawienia.

Jeżeli codebase ma już wzorzec zapisywania owner/provenance dla placed objects, wykorzystać ten wzorzec zamiast dodawać nowy.

## 3. Nie używać `Traps` jako właściciela pułapki

Nie zapisuj `playerId` ani referencji do gracza tylko po to, aby odczytywać skill przy każdym rollu. Single-player nie potrzebuje tego, a decyzja utrudnia późniejszą autonomiczną symulację.

Jeśli persistence wymaga informacji o źródle przedmiotu, zachować tylko to, co istniejący save model już potrzebuje.

## 4. Detection powinno być event-driven / proximity-driven

Nie robić:

```text
for every animal
  for every trap
    check distance every frame
```

To byłoby szczególnie złe przy rosnącej liczbie zwierząt i placed objects.

Najpierw znaleźć istniejący mechanizm spatial/proximity/interactable lookup. Jeżeli fauna nie ma jeszcze hooka odpowiedniego dla trapów, dodać małą funkcję/seam np.:

```ts
findNearbyActiveTraps(animalPosition)
```

albo odpowiednik pasujący do istniejącej architektury.

Detection powinno być wykonywane dopiero gdy zwierzę faktycznie wchodzi w obszar oddziaływania aktywnej pułapki. Po wykryciu/uniknięciu zapisać cooldown dla pary `animalId + trapId`.

Nie potrzebujemy globalnego `TrapManager` ani `CooldownManager`.

## 5. Cooldown: deterministyczny i minimalny

`AnimalAgent.animalId` jest stabilnym ID instancji i może być użyte do klucza cooldownu.

Preferowany model:

```ts
trapCooldowns: Record<animalId, elapsedUntil>
```

lub mała lista/mapa tylko dla aktualnie zainteresowanych zwierząt.

Nie zapisuj całej historii prób.

Po save/load wystarczy zachować dane tylko wtedy, gdy cooldown ma znaczenie dla ciągłości. Jeszcze lepiej: jeżeli istniejący world-time timestamp pozwala deterministycznie wyznaczyć wygaśnięcie, zapisać minimalny timestamp.

Nie rollować detection ponownie aż cooldown wygaśnie.

## 6. Capture powinien używać istniejącego death lifecycle

Po udanym rollu nie rób ręcznie:

```text
animal.visible = false
animal.dispose()
```

Najpierw sprawdź istniejący `AnimalAgent.collapse()` / `onDeath` flow i wykorzystaj go.

To jest szczególnie istotne dla planów 125/137/138, ponieważ śmierć może aktualizować spawn point population, corpse lifecycle, quest hooks i inne systemy.

Pułapka powinna tylko być źródłem obrażeń/śmierci lub wywołać istniejący publiczny death API w sposób zgodny z aktualnym kodem.

## 7. Loot: nie wkładać mięsa automatycznie do inventory bez sprawdzenia obecnego flow

Plan mówi o „gracz otrzymuje yield mięsa”, ale obecny system harvestu jest akcją gracza na corpse i mapuje gatunek → species meat + hide.

Pułapka działa autonomicznie, więc bezpośrednie dodanie itemu do `PlayerController.inventory` byłoby podejrzane architektonicznie, szczególnie gdy gracz jest daleko.

Preferowana kolejność:

1. capture zabija zwierzę przez istniejący death lifecycle;
2. wynik pułapki tworzy istniejący world/dropped-item flow albo persisted catch result;
3. gracz może odebrać wynik przez istniejący mechanizm interakcji.

Jeżeli codebase ma już mechanizm, który pozwala world objectowi wygenerować loot bez aktywnego gracza, reuse tego mechanizmu.

Nie twórz `TrapLootManager`.

Ważne: nie kopiuj automatycznie `startHarvestMeat()`, bo harvest knife jest osobną mechaniką z czasem akcji, pinowaniem corpse i hide byproductem. Zdecyduj jawnie, czy trap daje species meat, generic `raw_meat`, czy pełny harvest yield. Plan obecnie sugeruje istniejący species-meat mapping, więc najbezpieczniej reuse istniejącego mapowania, ale zachować loot jako world item zamiast bezpośredniego inventory mutation.

## 8. `hide` jest decyzją do potwierdzenia, nie rozszerzać zakresu

`docs/items/CATALOG.md` potwierdza, że obecny knife harvest daje species meat + `hide`.

Plan 141 słusznie nie tworzy nowego harvest systemu, ale nie powinien przypadkowo zacząć dawać hide tylko dlatego, że reuse funkcję harvest.

Jeżeli capture ma być pełnym odpowiednikiem harvestu, opisać to jawnie i pokryć testem. Jeżeli ma dawać tylko mięso, wydzielić/współdzielić samo mapowanie gatunek → meat zamiast wywoływać cały harvest flow.

## 9. Gatunki: użyć jawnego compatibility table

Nie opierać kompatybilności na negacji:

```ts
kind !== 'wolf'
```

Zamiast tego jawna tabela:

```ts
const TRAPPABLE_SPECIES = new Set([
  'rabbit',
  'boar',
  'deer',
])
```

Nazwy muszą odpowiadać faktycznym `AnimalDef.kind` w aktualnym codebase. Szczególnie sprawdzić, czy używany jest `deer`, `sarna`, `stag` itd.; `docs/STATE.md` pokazuje zarówno deer/stag jako osobne modele/role.

Nie zakładać, że przykładowa lista z planu jest 1:1 zgodna z enumem/definicją.

## 10. Trap item vs placed object

Pułapka powinna mieć dwa poziomy danych:

### Item definition

Współdzielona definicja `simple/good`:

- label;
- weight/cost zgodnie z istniejącym item model;
- model URL;
- durability max;
- detection base;
- weather resistance.

### Placed state

Tylko runtime/persistence:

- stable `trapId`;
- kind;
- position;
- state;
- remaining durability;
- activation skill snapshot;
- minimalny cooldown state, jeśli potrzebny.

Nie kopiować całej definicji do save.

## 11. ItemKind i inventory

Jeżeli obecny `ItemKind` jest unionem stringów, dodać dwa nowe kinds zgodnie z istniejącym stylem.

Pułapki nie powinny być `holdable`, chyba że istniejący placement UX wymaga tego. Plan mówi o wyborze z inventory i placement, a nie o trzymaniu modelu w ręce.

Sprawdzić obecny flow namiotu, ponieważ `tent` jest już inventory itemem, który nie jest `HeldTool` i może być dobrym wzorcem dla placement.

Nie tworzyć osobnego inventory UI tylko dla trapów.

## 12. Persistence

Przed zmianą save schema sprawdzić aktualny `SaveData` i migration/versioning.

Pułapka musi mieć stabilne ID, ponieważ później będzie można ją powiązać z cooldownem/eventami bez polegania na pozycji jako ID.

Do save trafia tylko stan, którego nie da się odtworzyć:

```text
id
kind
position
state
remainingDurability
skillValueAtActivation
cooldownUntil (jeśli wymagane)
```

Nie zapisywać:

- modelu;
- base detection;
- weather resistance;
- compatibility list;
- derived values.

Jeżeli save schema zmieni wersję, dodać migrację i test istniejącego save.

## 13. Weather: nie uszkadzać deterministycznego modelu pogody

`WorldClimateState` jest funkcją `worldSeed + elapsedDays`; nie ma historii pogody do odtworzenia.

Dlatego trap weather wear nie powinien wymagać zapisywania „ostatniego deszczu”.

Najlepiej rozważyć deterministyczny event przy przejściu weather cycle albo przy istniejącym world update. Jeżeli zużycie zależy od czasu trwania ciężkiej pogody, powinno być obliczalne z elapsed world time.

Unikać:

```text
trap.tickWeather(delta) // każda klatka dla każdej pułapki
```

Lepsze są:

```text
weather cycle changed
→ update affected traps
```

albo lazy calculation przy aktywacji/interakcji/odczycie stanu.

Nie dodawać globalnego trap weather ticker.

## 14. Durability — uprościć pierwszą wersję

Plan miesza „liczbę dostępnych użyć”, zużycie przez capture i pogodę. Przed implementacją wybrać jeden model.

Rekomendacja:

- `remainingDurability` jako ciągła liczba lub integer uses;
- capture zawsze zużywa 1 use;
- ciężkie warunki pogodowe zużywają dodatkowo tylko przy określonym weather-cycle event;
- deactivate nie zużywa durability;
- detection/uniknięcie nie zużywa durability, chyba że balans później wyraźnie tego wymaga.

To daje czytelny model i łatwe testy.

Jeśli `simple` ma być bardziej podatna na pogodę, różnica powinna wynikać z jednej definicji `weatherWearMultiplier`, a nie z osobnego systemu.

## 15. Detection formula

Nie kodować wartości bezpośrednio w `AnimalAgent`.

Wydzielić czystą funkcję, np.:

```ts
trapDetectionChance({
  baseChance,
  trapQuality,
  skillValue,
}): number
```

oraz osobno:

```ts
rollTrapDetection(chance, random)
```

Dzięki temu łatwo przetestować granice i balans.

Ważne: semantyka musi być jednoznaczna. `detectionChance` to prawdopodobieństwo **wykrycia**, więc wyższy `Traps` ma je zmniejszać. Nie odwracać nazw na `captureChance`, bo to zwiększa ryzyko błędu w implementacji.

Wynik clamp do rozsądnego zakresu, np. `[minDetection, maxDetection]`; nie dopuszczać do 0% detection tylko dlatego, że skill zbliża się do 1.

## 16. Randomness

Detection roll musi używać istniejącego wzorca deterministycznej/randomized simulation używanego przez faunę, a nie `Math.random()` w nowym miejscu, jeśli aktualna fauna posiada seeded/random utility.

Jeżeli obecne decyzje AnimalAgent używają kontrolowanego RNG, reuse tego mechanizmu.

Testy powinny przyjmować jawny random input zamiast testować przypadkowość.

## 17. Player skill integration

`PlayerSkills.ts` ma obecnie:

```ts
type SkillId = 'sneak' | 'survival'
```

oraz wspólne:

- `xpToSkillValue()`;
- `awardSkillXp()`;
- `restorePersistedSkills()`;
- `SKILL_XP_AWARD`.

Implementacja powinna rozszerzyć te istniejące mechanizmy, nie tworzyć `TrapSkill.ts`.

Dodać:

```ts
SkillId = 'sneak' | 'survival' | 'traps'
```

`createPlayerSkills()` powinno utworzyć `traps` z XP 0.

`restorePersistedSkills()` automatycznie obsłuży brak pola w starym save jako 0, o ile save typing/migration pozwala na partial skills. Zweryfikować przed dodaniem nowej migracji — nie zakładać, że potrzebna jest osobna wersja tylko dla samego nowego skillu.

`SKILL_XP_AWARD.captureTrap` powinien być jedynym miejscem wartości XP.

XP tylko po **potwierdzonym capture**, nie po aktywacji, uniknięciu ani czasie działania.

## 18. XP i wielokrotne capture

Uważać na możliwość przyznania XP dwa razy:

```text
trap capture
→ animal death
→ death hook
→ loot event
→ trap success callback
```

Tylko jeden punkt powinien wykonywać `awardSkillXp()`.

Najlepiej zrobić to w trap capture success path, przed/po death event zgodnie z istniejącym lifecycle, ale zapewnić single-owner semantics.

## 19. World independence / off-screen behavior

To jest istotny punkt planu i warto go doprecyzować podczas implementacji.

Jeżeli fauna jest obecnie symulowana szczegółowo tylko w aktywnym/załadowanym obszarze, nie próbować od razu budować pełnej off-screen trapping simulation.

Pierwsza wersja może działać tylko w ramach istniejącego fauna simulation lifecycle, pod warunkiem że nie psuje ciągłości świata.

Nie dodawać nowego systemu „trap simulation for unloaded chunks”. Jeśli obecna architektura nie pozwala trapom działać off-screen, zapisać to jako loose end zamiast rozszerzać zakres 141.

## 20. Model 3D

`docs/assets/MODELS.md` nie ma obecnie dedykowanego modelu pułapki.

Plan wymaga realnego modelu, więc podczas implementacji:

1. najpierw sprawdzić `_temp/Models` i istniejące `public/models`;
2. sprawdzić, czy można reuse istniejący model bez wprowadzania nowego assetu;
3. jeśli trzeba nowy asset, dodać wpis do `docs/assets/MODELS.md` zgodnie z `CLAUDE.md`;
4. Poly Pizza tylko po potwierdzeniu licencji/creditów;
5. podłączyć oba warianty do istniejącego loader/fallback pattern.

Nie robić dwóch osobnych loaderów. Definicja `simple/good` powinna wskazywać model URL.

## 21. Interakcja

Wykorzystać istniejący `[E]` interaction prompt i placement flow.

Nie dodawać dedykowanego trap UI.

Minimalny UX:

```text
inventory → Place trap
          ↓
       placed
          ↓
       [E] Activate
          ↓
       active
          ↓
       [E] Deactivate
          ↓
       placed
```

Po `broken` powinien istnieć sensowny existing-world-object interaction path. Jeśli obecny lifecycle nie ma „collect broken object”, nie wymyślać nowego systemu — wykorzystać istniejące remove/collect semantics albo zapisać blocker.

## 22. Visual states

Nie potrzebujemy osobnego UI.

Preferowany mechanizm:

- model variant, jeśli asset ma warianty;
- inaczej proste material tint / scale / mesh change;
- `active` powinien być czytelny nawet bez tekstu;
- `broken` powinien wyglądać wyraźnie inaczej.

Nie dodawać per-frame animation tylko po to, aby pokazać state.

## 23. Tests — priorytet

Najważniejsze testy czystej logiki:

1. `xpToSkillValue` nadal działa dla trzech skills.
2. `trapDetectionChance` maleje wraz ze skill value.
3. detection nigdy nie spada do gwarantowanego 0/1 wbrew założeniom balansu.
4. detection roll jest poprawny dla granicznych random values.
5. tylko trappable species przechodzą compatibility check.
6. `placed → active → placed` działa bez durability loss przy deactivate.
7. capture zużywa durability dokładnie raz.
8. durability 0 daje `broken`.
9. weather wear jest większy dla `simple`.
10. cooldown blokuje ponowny roll dla tego samego `animalId + trapId`.
11. cooldown nie blokuje innego zwierzęcia / innej pułapki.
12. successful capture daje dokładnie jeden XP award.
13. species → meat mapping używa istniejących `ItemKind`.
14. brak `traps` w starym save daje initial skill.

## 24. Verification order

Agent powinien pracować w małych pętlach:

1. `PlayerSkills` + tests.
2. item definitions/catalog.
3. pure trap definitions/detection tests.
4. placed-object lifecycle.
5. fauna integration.
6. loot/death integration.
7. weather wear.
8. persistence.
9. model wiring.
10. interaction/visual state.
11. technical checks.
12. browser/manual verification zgodnie z `CLAUDE.md`.

Nie robić pełnego refactoru world objectów przed pierwszym działającym trap lifecycle.

## 25. Scope guard

Jeżeli podczas implementacji pojawią się potrzeby:

- bait/przynęty;
- trap crafting;
- trap repair;
- off-screen trap simulation;
- live capture;
- predator traps;
- NPC trap usage;
- trap quest chain;
- rozbudowane UI;

nie rozszerzać planu 141. Dodać wpis do `docs/plans/LOOSE-ENDS.md` i zakończyć zakres planu.

## 26. Suggested implementation shape

Nie jest to obowiązkowa struktura plików, ale agent powinien preferować małe, czyste moduły:

```text
items/
  itemCatalog.ts        ← item definitions / metadata
  items.ts              ← ItemKind / ITEM_DEFS

player/
  PlayerSkills.ts       ← SkillId + shared XP curve + Traps XP

world/
  ... existing placed-object lifecycle ...
  animalTraps.ts        ← tylko jeśli istniejący world-object seam nie wystarczy

fauna/
  ... AnimalAgent integration ...
  animalTraps.ts        ← pure detection/compatibility logic, jeśli naturalnie pasuje

persistence/
  saveData.ts           ← minimalny persisted trap state
```

Nie traktować powyższego jako nakazu utworzenia `animalTraps.ts` po obu stronach. Najpierw znaleźć najbliższy istniejący owner odpowiedzialności.

## 27. Final review against current architecture

Przed zamknięciem implementacji agent powinien odpowiedzieć sobie:

- Czy pułapka korzysta z istniejącego item placement?
- Czy capture przechodzi przez istniejący `AnimalAgent` death lifecycle?
- Czy species meat mapping jest współdzielony zamiast skopiowany?
- Czy `Traps` korzysta ze wspólnej `PlayerSkills` curve?
- Czy trap działa bez referencji do `PlayerController`?
- Czy nie ma per-frame globalnego trap×animal scan?
- Czy weather wykorzystuje istniejący deterministic climate?
- Czy persistence przechowuje tylko nieredundantny stan?
- Czy `WorldBundle` lifetime/rebuild invariant jest zachowany?
- Czy model został dodany do asset backlogu, jeśli był potrzebny?
- Czy testy obejmują czystą logikę, a browser verification jest osobno oznaczona?

Jeżeli odpowiedź na któreś pytanie brzmi „nie”, najpierw sprawdzić, czy istniejący kod wymusza wyjątek. Nie rozwiązywać problemu przez dodanie kolejnego globalnego managera.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
