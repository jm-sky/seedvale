# Plan: Wielorakie wioski (multi-settlement)

**Status:** `verification needed`
**Created:** 2026-08-07
**Implemented:** 2026-08-07 (v1 — patrz "Stan implementacji" poniżej)
**Scope:** v0.4+ (questy między wioskami), nadbudowa nad [quests-v1.md](./2026-08-07--015--quests-v1.md) (system questów), rozszerzenie [world-streaming-persistence.md](./2026-08-07--007--world-streaming-persistence.md) (chunk streaming)

## Stan implementacji (v1, 2026-08-07)

Zaimplementowane zgodnie ze szkicem poniżej, z kilkoma decyzjami podjętymi podczas implementacji:

- **Grid step:** 280 jednostek, offset ±30% pół-kroku (`SETTLEMENT_GRID_STEP` w `settlementGenerator.ts`) — daje bezpieczny margines ponad wymagane min. 150 jednostek nawet po uwzględnieniu lokalnego jittera `findSettlementSite` (±24 jedn.).
- **Wioska #0 (home):** identyczna z poprzednim zachowaniem co do bitu — `findSettlementSite` przyjmuje teraz opcjonalny `center` (domyślnie `{0,0}`), a generator dla komórki `(0,0)` używa `seed` bez dodatkowego XOR-a, więc strumień losowy `seed ^ 0xc0ffee` wewnątrz `findSettlementSite` jest identyczny jak wcześniej. Gracz spawnuje się w tym samym miejscu, imiona NPC takie same.
- **Streaming:** `SettlementsManager` (analogicznie do `chunkManager`) — `settlementLoadRadius = 300`, `unloadRadius = 420` (histereza), throttling co `loadRadius * 0.25` przesunięcia gracza. Definicje wiosek (`SettlementDef`) cache'owane per-cell (deterministyczne z seeda), więc powtórne rechecki nie robią ponownie 80-próbkowego search flat-site.
- **NPC w innych wioskach:** *zdecydowano zaludnić wszystkie streamowane wioski* (nie zostawiać pustych) — `SettlementDef.npcCount` (3-5, seeded) używany dla wiosek innych niż home; koszt niski dzięki cache'owaniu GLTF (`loadGltf`/`loadGltfAsset` cache'ują po URL).
- **Las wokół wiosek:** tylko wioska home dostaje pełny "forest belt" (`buildSettlementProps(..., plantForest)`) — pozostałe wioski mają tylko rdzeń (studnia/stockpile/ogród/chaty), bez pasm lasu. Powód: pas lasu jest kosztowny (dziesiątki klastrów) i nakładałby się z wegetacją generowaną per-chunk (która jest wyłączona tylko dla `homeChunks`, nie dla terenu wokół innych wiosek). NPC w innych wioskach po prostu nie wybierają potrzeby "wood" (kod już to obsługuje: `landmarks.trees.length > 0` guard w `NpcAgent.ts`).
- **Fauna / item spawnery:** nadal zakotwiczone tylko o `settlementsManager.home.center` (zgodnie z "poza zakresem v1" — dystrybucja zasobów per wioska nie jest jeszcze zrobiona).
- **Minimap:** rozszerzona (`createMinimap.ts`) — pokazuje wszystkie aktualnie załadowane wioski (żółte kwadraty on-map / strzałki off-map) i ich NPC-e, nie tylko jedną.
- **Panel Mieszkańcy:** pokazuje NPC-ów ze wszystkich aktualnie załadowanych wiosek (`settlementsManager.getLoaded().flatMap(s => s.npcs)`).
- **Questy:** bez zmian — nadal działają na nazwach NPC niezależnie od tego z której wioski pochodzą; multi-village questy nadal poza zakresem (patrz sekcja "Poza zakresem v1").

Sanity check: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` — wszystkie czyste. **Nie zweryfikowano jeszcze w przeglądarce** (patrz "Do przetestowania" — wymaga manualnego testu przez użytkownika, zgodnie z zasadą projektu).

**Update (2026-08-08, po `village-generation.md`):** `SettlementDef.npcCount` (opisane wyżej jako "NPC w innych wioskach") **nie istnieje już w kodzie** — [village-generation.md](./2026-08-08--031--village-generation.md) zastąpiło je systemem rodzin (`src/settlement/families.ts`: `rollVillageSize`/`generateFamilies`), więc liczba i skład NPC per wioska (poza home) wynika dziś z wylosowanego rozmiaru wioski (SM/MD/LG) i rodzin, nie z pojedynczego `npcCount` 3-5. Reszta ustaleń w tej sekcji (grid step, streaming, minimap, panel Mieszkańcy, brak multi-village questów) pozostaje aktualna.

## Kontekst

Aktualnie: **jedna wioska** na mapie, zawsze generowana w tym samym miejscu (seeded `findSettlementSite` przy stałym seed). System questów v1 (patrz [quests-v1.md](./2026-08-07--015--quests-v1.md)) pracuje na NPCs w jednej osadzie. Chcemy rozszerzyć na **wielorakie wioski** rozproszone na mapie, oddalone od siebie, żeby:

- Questy mogły wysyłać gracza między wioskami (potem + bardziej zaawansowany quest system)
- Zwiększyć skalę zabawy i poczucie odkrywania
- Każda wioska miała własne NPC-e, potrzeby, charaktery (baza postaci w osobnym planie)

## Stan obecny (dla kontekstu)

- `findSettlementSite()` → wyszukuje jedno miejsce na mapie dla osady, seeded deterministycznie
- `createSettlement()` → tworzy budynki + NPC-e dla jednej wioski
- `createApp()` → loaduje jedną osadę: `const settlement = await buildSettlement(...)`
- Teren: chunk streaming ([world-streaming-persistence.md](./2026-08-07--007--world-streaming-persistence.md)) — ładuje/wyładowuje chunki wokół gracza, brak globalnego limitu
- NPC imiona: pool `NPC_NAMES` w `NpcAgent.ts`, losowo/indeksowo przydzielane w ramach jednej osady
- Questy v1: hardcoded dwaj NPC-e z jednej osady

## Decyzja: architektura multi-settlement

### 1. Generator wiosek (seeded, rozproszone)

Zamiast jednego `findSettlementSite()` dla cały mapy, definiujemy **sieć wiosek** na poziomie terenu (podobnie do chunk streamingu):

- Stały wzór (grid lub rozproszona sieć) wiosek na mapie, deterministycznie obliczany z seeda
- Każda wioska ma indeks/ID (`settlementId`), współrzędne (`x, z`), rozmiar (liczbę NPC-ów)
- Przy generowaniu terenu: na każdy **chunk** lub **sektor** terenu liczą się jakie wioski mogą być w zasięgu gracza; tylko te ładujemy (podobnie do chunk streamingu)

**Wzór a:** Grid-based (`2D array` wiosek co N bloków terenu, np. co 200 jednostek). Prosty, deterministyczny, ale może być nudny (regularny wzór).

**Wzór b:** Poisson disk sampling (seeded) — rozproszone wiosek z minimalnym dystansem. Bardziej organiczne, ale trochę bardziej złożone.

**Rekomendacja na start:** Wzór a (grid), z lekkim noise offset (±10-30% kroku gridu) żeby nie były idealne. Wzór b do rozważenia jeśli grid wygląda nienaturalnie.

### 2. Streaming wiosek (load/unload na bazie dystansu od gracza)

Analogia do chunk streamingu:

- Zdefiniuj `settlementLoadRadius` (np. 300 jednostek od gracza)
- Każdy frame: iteruj po znanych wioskach, załaduj te wewnątrz promienia, wyładuj te poza
- Struktura: `Map<settlementId, Settlement | null>` w `createApp()` — `null` jeśli wyładowana

To daje kontrolę nad pamięcią (nie wszystkie wioski żyją na raz) i wydajnością (NPC-e z niewidocznych wiosek nie tick).

### 3. Unikanie kolizji (minimalna separacja)

Każda wioska zajmuje przestrzeń:

- Siedlisko budynków: ~20-40 jednostek promienia (wychodzi z `buildSettlementProps`, proporcjonalnie do `halfExtent` mapy)
- Poza wioskami: NIE chcemy by się zachodziły budynkami

**Prosty warunek:** między centrami wiosek minimum dystans (np. 150-200 jednostek) — wystarczy przy `settlementLoadRadius = 300` (nie załadujemy overlappujących sąsiadów).

Jeśli używamy grid-based: krok gridu ≥ `minSettlementDist` rozwiąże to automatycznie.

### 4. Unikalne imiona NPC-ów per wioska

Aktualnie: `NPC_NAMES` to pool 20-50 imion; każda wioska losuje z tej samej puli (może się powtarzać między wioskami — to OK na start).

**Opcja (nie obowiązkowe na v1):** osobna pool imion per wioska, żeby każdy NPC był unikalny globalnie. Wymaga:
- Refaktor `NpcAgent.create()` → dostaje imię zamiast indeksu
- Albo osobna rejestracja imion per `settlementId`

**Decyzja:** brak zmian na v1 — imiona mogą się powtarzać między wioskami (mniej kodu, prostsza persystencja); pozniej rozszerzenie jeśli zajdzie potrzeba.

### 5. Integracja z quest systemem

[quests-v1.md](./2026-08-07--015--quests-v1.md) definiuje jeden hardcoded quest (giver Anna → target Piotr, obie z tej samej wioski).

Dla multi-settlement:

- Quest: `giverSettlementId` + `targetSettlementId` — mogą być różne
- UI: jeśli target jest w innej wiosce, dialog/hint powinien wskazać kierunek (integracja z compass/minimap)
- Persystencja: quest state zapisze się w `SaveData` (dla v1 zamiast tego dryfujemy bez zapisu; v2 to zmienia)

**Zakres v1 tego planu:** tylko struktura danych (settlementa w `Map`, streaming); questy mogą być od razu per-settlement, ale hardcoded giver/target będą z **tej samej wioski** jak na razie. **Questy między wioskami** (travel quest) — osobny plan, potem.

## Poza zakresem v1

- Questy między wioskami (wymaga sposobu na wskazanie odległego NPCa graczu — compass/minimap/marker)
- Unikalne imiona per wioska (globalna rejestracja postaci)
- Rynki/handel między wioskami
- Dystrybucja zasobów per wioska (np. ta wioska ma drewno, tamta ma jedzenie)
- Dynamiczne zdarzenia w wioskach (ataki wrogów, epidemie, itp.)

## Szkic zmian (pliki)

```
src/settlement/settlementGenerator.ts  # nowy: grid/Poisson sampling wiosek, deterministyczne z seeda
src/settlement/SettlementsManager.ts   # nowy: zarządzanie kolekcją, streaming (load/unload), query po ID
src/settlement/createSettlement.ts    # zmiana sygnatury: + settlementId (indeks do wyświetlania)
src/settlement/findSettlementSite.ts  # bez zmian (logika wyszukiwania lokalnego); przejmowana przez generator
src/app/createApp.ts                  # zmiana: zamiast `settlement` → `settlementsManager`, rejestracja tick/dispose
src/ai/NpcAgent.ts                    # opcjonalne: + settlementId jako field (dla futures), brak zmian wymaganych v1
```

## Decyzje techniczne

- **Streaming na dystansie:** load/unload bazowany na `Math.hypot(playerX - settlementX, playerZ - settlementZ) < radius`
- **Seeded generator:** `settlementGenerator.ts` używa `createSeededRandom(seed ^ magicNumber)` (podobnie do `findSettlementSite`), żeby zawsze te same wioski dla tego samego seeda mapy
- **Grid offset:** jeśli grid-based, każde `(row, col)` ma noise-offset wyliczony z `seeded(settlementId)`, nie czysto regularny
- **MinDist:** empirycznie: ~150 jednostek (będzie testowane w przeglądarce)

## Done when

- [x] `settlementGenerator.ts` generuje listę `SettlementDef[]` (id, x, z, npcCount) dla mapy seeded-deterministically
- [x] Dystans między generowanymi wioskami ≥ 150 jednostek (grid step 280 + offset ≤30%, empirycznie bezpieczny margines — patrz "Stan implementacji")
- [x] `SettlementsManager` ładuje/wyładowuje wioski na bazie `settlementLoadRadius` (throttled, jak `chunkManager`)
- [x] `createApp()` używa managera zamiast single `settlement`, iteruje po loaded wioskach w update/dispose
- [x] Jedna wioska (id `0_0`) jest tą, gdzie gracz się spawns (jak wcześniej `settlement`) — bit-identyczna z poprzednim zachowaniem
- [x] Reszta wiosek generuje się i streamuje; *zaludnione* (zdecydowano nie zostawiać pustych — patrz "Stan implementacji"), ale bez pełnego forest-belt
- [x] Sanity check: `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` czyste
- [ ] Regresja: gra dalej się loaduje, gracz może chodzić, jedynie wioska (pierwsza) zachowuje się jak wcześniej — **wymaga manualnego testu w przeglądarce (nie wykonano)**

## Do przetestowania (http://localhost:5577/)

1. Gra startuje jak zwykle — pierwsza wioska spawns, gracze widzi NPC-e.
2. Poruszanie się dookoła mapy: włącz DevTools (F12 → Console) i sprawdź logi `SettlementsManager`:
   - Jakie wioski są loaded/unloaded przy ruchu
   - Czy load/unload dzieje się bez artefaktów (flickeringu, tekstur które nie loadują)
3. Config `?seed=12345` — ta sama mapa powinna mieć wioski w tych samych miejscach (seeded deterministically)
4. Minimap (`M`) — jeśli jest aktywna, powinna pokazywać settlementy (wymagana integracja z minimap, por. [minimap.md](./2026-08-07--029--minimap.md))
5. Sanity check regresji: wioska #0 tam, gdzie była: gracz spawns w tym samym miejscu, imiona NPC-ów znowu takie same

## Następnie

- Questy między wioskami (wymaga compass/marker wskazującego cel)
- Integracja z pełną bazą postaci ([npc-character-depth.md](./2026-08-07--022--npc-character-depth.md))
- Persystencja quest state w save ([quests-v1.md](./2026-08-07--015--quests-v1.md) v2)
- Dynamiczne zdarzenia w wioskach (osobny plan)
- Drogi między osadami + ścieżki do mniejszych lokalizacji (port/przystań) — [roads-and-paths.md](./2026-08-07--026--roads-and-paths.md), reużywa `generateSettlementDef`/`SETTLEMENT_GRID_STEP`/`cellsWithinRadius` 1:1
