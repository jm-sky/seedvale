# Plan: Player Storage & Container System

**Created:** 2026-08-19
**Status:** `done` — implemented + technically verified (`tsc`/lint/build/test all green, save schema bumped to v22). Browser/manual verification not performed — see implementation notes below.
**Priority:** high · **Effort:** M
**Depends on:** none

## Cel

Wprowadzić generyczny system kontenerów i storage dla gracza.

Pierwszym zastosowaniem będzie skrzynka kupowana u handlarza. System ma być niezależny od Companion i później obsługiwać również NPC, household storage oraz logistics.

## 1. Item Size

Obecne przedmioty mają `weight`, ale nie mają gabarytu.

Dodać:

```text
XS | SM | MD | LG | XL
```

`ItemSize` jest niezależny od `weight`.

Wstępnie:

| Size | Przykłady |
|---|---|
| XS | gwóźdź, drobne materiały |
| SM | nóż, sakiewka |
| MD | krótki miecz, mały łuk, siekiera |
| LG | długi miecz, widły, łopata |
| XL | duże przedmioty |

Ostateczny podział należy ustalić po przejrzeniu całego `ItemKind` / `CATALOG.md`.

## 2. Container Capacity

Kontener ma pojemność gabarytową.

Przykład:

```text
1 XL + 3 MD
```

Można zastosować wewnętrzne jednostki pojemności, np.:

```text
1 XL = 1.5 LG = 3 MD
```

Przeliczniki należy ustalić na podstawie rzeczywistych przedmiotów.

Pojemność ma być górnym limitem, a nie dokładnym systemem Tetris. Kontenery nie powinny być nadmiernie ograniczające.

## 3. Generic Container

Wprowadzić generyczny model `Container`.

Powinien obsługiwać m.in.:

- własną wagę,
- pojemność,
- zawartość,
- pozycję w świecie,
- możliwość otwarcia,
- możliwość podnoszenia.

Docelowo:

```text
Container
├── Chest
├── Large Chest
├── Barrel
├── Crate
├── Sack
└── ...
```

Nie tworzyć osobnego `ChestSystem`.

## 4. Chest

Pierwszym konkretnym kontenerem będzie skrzynka.

Skrzynkę można:

- kupić u handlarza,
- umieścić w świecie,
- otworzyć,
- napełnić,
- opróżnić,
- podnieść,
- przenieść.

Powinna wykorzystywać istniejące systemy itemów i handlu.

## 5. Container Contents

Zawartość kontenera musi respektować:

```text
ItemSize → czy przedmiot się mieści
Weight   → masa kontenera
```

Masa kontenera:

```text
container weight + sum(item weight)
```

`ItemSize` i `weight` są niezależnymi ograniczeniami.

Przykłady:

- duży, lekki przedmiot może nie zmieścić się w małej skrzyni,
- mały, ciężki przedmiot może się zmieścić gabarytowo, ale zwiększyć masę kontenera.

## 6. Player Inventory

Rozszerzyć istniejący `Inventory` o ograniczenie wynikające z `ItemSize`.

Nie tworzyć nowego systemu inventory.

Podczas implementacji ustalić:

- pojemność inventory,
- sposób liczenia zajętej pojemności,
- zachowanie stacków,
- współpracę z obecnym pojedynczym slotem `HeldTool`.

## 7. Container Interaction

Dodać generyczną interakcję kontenera.

Docelowy układ:

```text
┌─────────────────────┐
│     W skrzyni       │
│                     │
│  item  item  item   │
│                     │
├─────────────────────┤
│      U gracza       │
│                     │
│  item  item  item   │
└─────────────────────┘
```

UI powinno umożliwiać:

- przenoszenie gracz → kontener,
- przenoszenie kontener → gracz,
- sprawdzanie pojemności,
- informowanie o braku miejsca,
- obsługę desktop,
- obsługę mobile/touch.

Interfejs powinien być generyczny dla `Container`, nie dla `Chest`.

Może bazować wizualnie/interakcyjnie na istniejącym ekranie handlarza.

## 8. Podnoszenie kontenera

Kontener można próbować podnieść.

Całkowita masa:

```text
container weight
+
sum(item weight)
=
carried weight
```

Podniesiony kontener powinien być traktowany przez system obciążenia gracza jako normalny ciężar.

Po przeniesieniu można go ponownie umieścić w świecie.

Nie tworzyć osobnego mechanizmu „carry chest”.

## 9. Player Encumbrance

Wprowadzić lub rozszerzyć system przeciążenia gracza.

Wstępne założenia:

```text
0–10%      normalna prędkość

10–30%     znacznie zmniejszona prędkość

>30%       brak możliwości ruchu
```

Przykład:

```text
carry capacity = 30 kg
current load   = 36 kg
overload       = 20%
```

→ gracz może się poruszać, ale znacznie wolniej.

Wstępnie zakres 10–30% powinien redukować prędkość do około 50–70%.

Dokładna funkcja powinna być dobrana podczas implementacji tak, aby nie powodowała nieprzyjemnych skoków przy przekraczaniu progów.

## 10. Storage Data Model

Stan kontenera powinien posiadać stabilną tożsamość i zawartość.

Minimalnie:

```text
containerId
containerKind
position
placed state
contents
```

Właściwości wynikające z definicji kontenera, np. capacity i base weight, nie powinny być niepotrzebnie duplikowane w stanie runtime/save.

Należy wykorzystać istniejące wzorce `WorldBundle`, placed world objects oraz persistence.

## 11. Persistence

Stan kontenera musi przetrwać:

- save/load,
- rebuild world bundle,
- ponowne załadowanie odpowiedniego obszaru świata, jeżeli kontenery są objęte streamingiem.

Należy zachować:

- identyfikator,
- typ,
- pozycję,
- zawartość,
- stan umieszczenia.

Nie tworzyć osobnego save systemu.

## 12. Future Storage Types

Architektura powinna umożliwić późniejsze:

```text
Small Chest
Medium Chest
Large Chest
Barrel
Crate
Sack
```

oraz różne materiały:

```text
Wood
Metal
...
```

Różnice mogą wpływać na:

- capacity,
- base weight,
- koszt,
- wygląd,
- możliwość podnoszenia,
- trwałość.

Nie implementować tych wariantów, jeżeli nie są potrzebne do pierwszej wersji.

## 13. NPC / Logistics Compatibility

System musi być możliwy do wykorzystania przez NPC.

Przyszły przepływ:

```text
NPC
 ↓
gather food
 ↓
transport
 ↓
player container
```

Nie projektować API wyłącznie pod interakcję gracza.

Storage powinien być normalnym elementem świata, do którego mogą odwoływać się przyszłe systemy:

- NPC,
- household,
- settlement,
- logistics,
- companions.

## 14. Poza zakresem

Nie implementować na tym etapie:

- dokładnych wymiarów fizycznych,
- rotacji przedmiotów,
- Tetris inventory,
- fizycznego układania przedmiotów,
- wielu poziomów slotów,
- automatycznego sortowania,
- specjalnego Companion Storage,
- specjalnego Chest AI,
- multiplayer-specific storage.

`ItemSize` jest abstrakcją gabarytu, a nie symulacją fizycznego pakowania.

## 15. Weryfikacja

### Items

- każdy istniejący `ItemKind` ma `ItemSize`,
- `ItemSize` nie zastępuje `weight`,
- istniejące stacki nadal działają.

### Inventory

- przedmiot przekraczający pojemność nie może zostać dodany,
- normalne użycie inventory działa jak wcześniej.

### Container

- można kupić skrzynkę,
- można ją umieścić,
- można ją otworzyć,
- można wkładać przedmioty,
- można je wyjmować,
- pojemność jest respektowana,
- masa zawartości jest liczona.

### Carrying

- można podnieść pustą skrzynkę,
- można podnieść skrzynię z zawartością,
- masa wpływa na encumbrance,
- przeciążenie 10–30% ogranicza ruch,
- przeciążenie >30% blokuje ruch.

### UI

- desktop,
- mobile/touch,
- transfer w obu kierunkach,
- poprawne komunikaty o braku miejsca.

### Persistence

- skrzynka przetrwa save/load,
- zawartość zostanie zachowana,
- pozycja zostanie zachowana,
- po ponownym załadowaniu masa zostanie poprawnie wyliczona.

## 16. Kryterium ukończenia

Gracz może:

1. kupić pustą skrzynkę,
2. postawić ją w świecie,
3. otworzyć ją,
4. przenosić przedmioty między inventory i skrzynką,
5. być ograniczony przez `weight` i `ItemSize`,
6. podnieść skrzynię wraz z zawartością,
7. przenieść ją w inne miejsce,
8. zapisać i odtworzyć jej stan.

Jednocześnie system jest gotowy do wykorzystania przez przyszłe NPC storage i logistics.

## 17. Implementation notes (2026-08-20)

**Implemented:**

- `ItemSize`/`ITEM_SIZE_UNITS`/`itemSizeUnits()` (`items/items.ts`) — every `ItemKind` has a `size`, independent of `weight`.
- `Inventory.maxSize`/`totalSize()`/`canAdd()`/`canAddInstance()` (`items/Inventory.ts`) — gabarite gate independent of weight; player's own inventory uses `DEFAULT_MAX_SIZE = 40` (`createApp.ts`), every other caller (NPC, container contents, older tests) keeps the pre-164 `Infinity` default.
- Generic `Container`/`ContainerDef`/`CONTAINER_DEFS` (`items/container.ts`) — reuses `Inventory` directly as contents (no second stored-item model); `chest` is the only concrete kind so far, per §12/§14.
- World lifecycle: `world/createPlacedContainers.ts` (place/pick up/put down/deposit/withdraw, mirrors `PlacedTents`/`PlacedTraps`) + `world/containerProp.ts` (procedural box+lid, no GLB yet — `docs/assets/MODELS.md` M53).
- Player encumbrance: `player/playerEncumbrance.ts`'s `computeEncumbrance()` (smoothstep-interpolated 10%→30% band, matches §9's thresholds) — `PlayerController.setEncumbrance()`, called once/frame from `gameLoop.ts` with `inventory.totalWeight() + bundle.placedContainers.carriedWeightKg()`.
- Interaction: `[E]` opens the generic transfer screen (`ContainerScreen.vue`, modeled on `MerchantScreen.vue` per §7 — two columns, no prices), `[R]` picks the container up with contents (`interactables.ts`/`gameLoop.ts`/`createApp.ts`'s `openContainer`/`pickUpContainer`). Inventory's "Postaw" places a purchased chest (`placeContainerAtAim`); Quick Actions' "Odłóż skrzynię" puts a carried one back down (`putDownContainerAtAim`), shown only while `hasCarriedContainer`.
- Persistence: `SaveDataV22` (`placedContainers`/`carriedContainer`), full migration chain from every older version, restores as empty/null on pre-v22 saves.
- `items/tradeCatalog.ts`/`itemCatalog.ts` — `chest` is Kupiec-only stock (25 coin), matches §4.

**Technically verified:** `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build`, `pnpm run test` all pass, including new unit coverage (`items/Inventory.test.ts`'s gabarite-capacity block, `player/playerEncumbrance.test.ts`, `items/container.test.ts`, `persistence/saveData.test.ts`'s v22 block).

**Not done / deliberately deferred (matches §12/§14):**

- Only `chest` exists; Small/Medium/Large/Barrel/Crate/Sack and material variants are future work.
- No GLB for the chest yet — procedural box+lid prop.

**Browser/manual verification — not performed** (per repo convention, TS/lint/build/test passing is not proof of correct visual/gameplay behavior). Needs a manual pass in the running dev server:

- Buy a chest from Kupiec, place it (Inventory "Postaw"), confirm ground-placement rejection messages (water/slope/object/another chest).
- `[E]` open the transfer screen, move items both directions (stackable + at least one instance-backed kind, e.g. a trap), confirm capacity/weight rejection toasts.
- `[R]` pick the chest up (with contents), confirm Quick Actions shows "Odłóż skrzynię" and puts it back down correctly.
- Overload the player past 10%/30% thresholds (carry a full chest + inventory) and confirm the speed reduction/movement block feels smooth, not a hard pop.
- Save, reload, and rebuild the world (walk far away and back) — confirm the chest's position/contents/carried state all survive.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
