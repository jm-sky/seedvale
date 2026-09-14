# Plan: Story Item Inventory & Cave Location Clarity

**Created:** 2026-09-15
**Status:** `planned` 📋
**Type:** polish
**Priority:** high · **Effort:** M
**Model:** Sonnet, Composer
**Depends on:** ~~quests-progression-009~~, ~~quests-progression-014~~, ~~items-player-031~~
**Domain:** `quests-progression`
**Subdomains:** `quests`
**Tags:** `dialogue` `inventory` `story-items` `location-hints` `caves` `ui` `polish`
**Roadmap:** `quests-and-reputation.md`

## Cel

Poprawić czytelność questów i przedmiotów fabularnych tak, aby gracz:

1. od razu widział właściwą interakcję z mapą skarbu,
2. rozpoznawał przedmioty fabularne jako osobną grupę w ekwipunku,
3. miał kategorię `Inne` dla przedmiotów, które naprawdę nie pasują do pozostałych grup,
4. otrzymywał od NPC naturalny i konkretny opis wskazanej jaskini wraz z kierunkiem,
5. nie dostawał z dialogu większej wiedzy o nazwie miejsca niż wynika to z prostej, deterministycznej reguły roli NPC.

Zmiany mają rozszerzać istniejące mechanizmy inventory, `ItemCategory`, quest/world bindings, `Role`, `CaveArchetype` i `cardinalDirectionPhrase()`.

Nie tworzyć osobnego systemu quest locations, osobnego systemu wiedzy NPC ani osobnego modelu quest items.

---

## Zakres

### 1. Mapa skarbu — widoczna interakcja w Inventory

Aktualny codebase ma już pełny backend odczytu mapy:

- `ITEM_CATALOG[kind].treasureMap`,
- `ui.inventory.onRead`,
- `inventoryWiring.readTreasureMapItem()`,
- `QuestManager.onReadItem()`,
- reveal/navigation/location knowledge,
- persisted `treasureMapDarkForestRead`.

`InventoryScreenItemDetails.vue` pokazuje już `Odczytaj` dla `treasureMap`, ale `InventoryScreenItemList.vue` wystawia `Czytaj` tylko dla `book`.

#### Zmiana

W `InventoryScreenItemList.vue` dodać do modelu listy istniejące metadata `ITEM_CATALOG[group.kind].treasureMap` i pokazywać przycisk:

```text
Odczytaj
```

Akcja ma używać istniejącego `onRead(item.kind)` / `ui.inventory.onRead`, bez osobnego callbacku tylko dla listy.

Interakcja `Odczytaj` ma pozostać również w ekranie szczegółów.

#### Oczekiwany flow

```text
gracza znajduje mapę
→ mapa pojawia się w Inventory
→ przy mapie widoczny jest przycisk „Odczytaj”
→ kliknięcie używa istniejącego onRead
→ readTreasureMapItem()
→ QuestManager.onReadItem()
→ właściwa lokacja zostaje odkryta / ustawiona zgodnie z obecnym flow
```

Nie zmieniać semantyki odczytu mapy ani persistence.

---

### 2. Kategorie Inventory — `Fabularne` i `Inne`

Aktualny `ItemCategory` ma:

```text
resource | tool | utility | food | weapon | armor | knowledge
```

Dodać:

```text
story
other
```

Player-facing labels:

```text
story → Fabularne
other → Inne
```

Preferować nazwę **Fabularne**, nie `Specjalne`: kategoria ma opisywać rolę przedmiotu w historii/queście, a nie rzadkość, jakość lub bonus mechaniczny.

### 2.1. `story`

Do `story` przenieść minimum:

```text
treasure_map_dark_forest
signet_ring
bandit_ledger
marked_valuable
expedition_journal
```

oraz inne istniejące przedmioty, których podstawową rolą jest fabuła/quest, jeżeli recon implementacyjny to jednoznacznie potwierdzi.

`story` jest kategorią prezentacyjną. Sama kategoria nie może automatycznie oznaczać:

- zakazu sprzedaży,
- zakazu wyrzucania,
- niezniszczalności,
- persistence,
- ownership przez quest,
- wymogu `ItemInstance`.

Nie rozszerzać tego planu o redesign lifecycle story itemów.

### 2.2. `other`

`other` ma służyć dla przedmiotów, które naprawdę nie pasują do:

```text
weapon
armor
tool
story
knowledge
food
utility
resource
```

Nie robić `other` jako runtime fallbacku dla brakującej lub błędnej kategorii.

`ItemDef.categories` nadal ma być jawne i kompletne.

W ramach implementacji zrobić ograniczony audit oczywistych przypadków, które dziś są `resource`/`utility` tylko dlatego, że brakowało lepszej kategorii. Nie wykonywać pełnego redesignu katalogu itemów.

### 2.3. UI i sortowanie

Zaktualizować wszystkie miejsca wymagające exhaustiveness dla `ItemCategory`, minimum:

- `src/items/items.ts`,
- `CATEGORY_SORT_ORDER`,
- `src/ui-vue/composables/useItemCategoryLabels.ts`,
- `src/ui-vue/screens/InventoryScreenItemList.vue`,
- `src/ui-vue/screens/InventoryScreenItemDetails.vue`,
- merchant/category UI, jeżeli aktualny typ wymaga jawnej obsługi nowych kategorii.

Preferowana kolejność:

```text
weapon
armor
tool
story
knowledge
food
utility
resource
other
```

---

### 3. Wspólny player-facing opis jaskini

Quest mówiący o konkretnej jaskini powinien wykorzystywać wiedzę, którą binding już posiada, zamiast tekstów:

```text
w jaskini
w tej jaskini
w jakiejś jaskini
w konkretnej jaskini
w konkretnym lochu
dokładny loch
```

NPC powinien — gdy dane są już dostępne — przekazać:

```text
opis/nazwa miejsca + rzeczywisty kierunek
```

Nie tworzyć lookupu świata tylko po to, aby zbudować zdanie.

### 3.1. Dane wejściowe formattera

Wprowadzić mały, pure/player-facing formatter korzystający tylko z już resolved danych, np. kontrakt równoważny:

```ts
type QuestCaveDescriptionInput = {
  archetype: CaveArchetype
  direction: string | null
  locationName?: string | null
  speakerRole?: Role | null
}
```

Dokładny podpis dopasować do obecnego ownership/call-sites, ale zachować granicę odpowiedzialności:

- formatter nie wyszukuje cave,
- formatter nie zna `QuestManager`,
- formatter nie wykonuje terrain sampling,
- formatter nie wykonuje pathfindingu,
- formatter nie posiada persistent state,
- formatter nie ustala world identity.

Dodać JSDoc dla współdzielonej funkcji z `@domain quests-progression`.

### 3.2. Kierunek

Reuse istniejącego `cardinalDirectionPhrase()` i jego ośmiu sektorów:

```text
N, NE, E, SE, S, SW, W, NW
```

Nie tworzyć drugiej implementacji kompasu.

Kierunek zawsze ma wynikać z realnej pozycji celu względem odpowiedniej osady/origin już dostępnego podczas bindingu.

Jeżeli kierunek nie jest dostępny bez nowego kosztownego lookupu, użyć neutralnego fallbacku `poza osadą`.

---

### 4. Opis zależny od archetypu

Używać `CaveArchetype = natural | adventure | dungeon` jako semantycznej wskazówki do player-facing opisu.

Preferowany baseline:

```text
natural   → mała / niewielka jaskinia
adventure → głęboka / duża jaskinia
dungeon   → stary / rozległy loch
```

Nie pokazywać graczowi implementacyjnych nazw:

```text
natural cave
adventure cave
dungeon
Cave V2
```

Przykłady:

```text
„Schowek jest w małej jaskini na północny zachód od osady.”
„Szczątki leżą w głębokiej jaskini na północ od osady.”
„Bandycka kryjówka znajduje się w starym lochu na wschód od osady.”
```

Nie wymagać identycznego słownictwa w każdym queście; formatter może zwracać neutralną bazową frazę, a quest osadzać ją naturalnie w zdaniu.

---

### 5. Opcjonalna nazwa własna miejsca zależna od roli NPC

Nie używać nazwy własnej jaskini automatycznie tylko dlatego, że silnik ją zna.

Świat może znać `locationName`, ale NPC nie musi znać tej nazwy.

Nie tworzyć nowego systemu wiedzy NPC, pamięci lokacji ani familiarity.

Zastosować prostą, deterministyczną regułę opartą wyłącznie o istniejący `Role` z `src/ai/characters.ts`.

Aktualny enum zawiera:

```text
woodcutter
farmer
guard
trader
miner
fisher
hunter
blacksmith
shepherd
textile_worker
herbalist
```

#### Prosta reguła V1

Role terenowe / zawodowo przemieszczające się po okolicy mogą użyć kanonicznej nazwy miejsca, jeśli taka nazwa jest już dostępna w istniejącym binding/location data bez dodatkowego world search.

Preferowana początkowa grupa:

```text
guard
hunter
miner
trader
```

Pozostałe role używają opisu archetypu + kierunku.

Przykład dla tej samej jaskini:

```text
guard/hunter/miner/trader:
„To Jaskinia Mroczna, na północ od osady.”

farmer/woodcutter/...:
„To głęboka jaskinia na północ od osady.”
```

Jeżeli recon implementation notes pokaże, że konkretny `Role` ma wyraźnie istniejący terenowy charakter i warto go dopisać, można rozszerzyć małą allowlistę. Nie budować heurystyk z traits, relacji, historii, odległości czy randomu.

#### Guardrails

- brak losowości między rozmowami,
- ten sam world + ten sam NPC role + ta sama lokalizacja → ten sam sposób opisu,
- nazwa własna jest opcjonalna,
- jeżeli `locationName` nie istnieje, zawsze fallback do archetypu + kierunku,
- jeżeli role nie pozwala na nazwę, formatter ignoruje `locationName`,
- nie persistować wyniku formattera.

Losowość może zostać rozważona kiedyś wyłącznie dla równoważnych wariantów językowych, ale nie w tym planie.

---

### 6. Legacy / niewchodzalne groty

Jeżeli aktualny codebase nadal ma miejsca wizualnie przypominające jaskinie, ale należące do innego systemu niż walk-in Cave V2, nie przedstawiać ich automatycznie jako pełnoprawnej jaskini.

Po reconie aktualnego odpowiednika legacy cave / `rockDen` użyć player-facing typu zgodnego z realnym gameplayem, np.:

```text
skalna grota
płytka grota
jama pod skałami
```

Nie rozszerzać `CaveArchetype` tylko dla prose i nie przepinać fauna habitat systemu.

---

### 7. Cave dialogue/content pass

Przejrzeć wszystkie aktualne questy prowadzące do konkretnego cave bindingu.

Minimum:

- `src/quests/lostHunterNaturalCave.ts`,
- `src/quests/oldBonesAdventureCave.ts`,
- `src/quests/suspiciousTransportCaveCache.ts`,
- `src/quests/dungeonBanditTreasure.ts`,
- `src/quests/lostTreasureExpedition.ts`,
- cave-bound authored quests w `src/quests/quests.ts`,
- inne aktualne materializowane questy mające konkretne `caveId`.

Dla każdego sprawdzić:

```text
description
offerLine
reminderLine
playerLine
progressLine
reportLine
resultText
```

Pierwszy moment, w którym NPC faktycznie wskazuje miejsce, powinien przekazać pełną, dostępną mu informację.

Późniejsze linie nie muszą jej powtarzać i mogą mówić np.:

```text
ta jaskinia
wskazany loch
miejsce na północy
```

pod warunkiem że wcześniejsza rozmowa jasno wskazała cel.

Naprawić przy okazji oczywiste błędy językowe w edytowanych liniach, np.:

```text
w wskazanej jaskini → we wskazanej jaskini
```

Nie wykonywać pełnego rewrite questów niezwiązanych z cave/location clarity.

---

## Architektura i ownership

### Inventory

Pozostawić obecny flow:

```text
ItemKind
→ ITEM_DEFS.categories
→ primaryItemCategory()
→ Inventory UI
```

Nie tworzyć quest-specific inventory registry.

### Treasure map

Pozostawić obecny flow:

```text
ITEM_CATALOG.treasureMap
→ ui.inventory.onRead
→ inventoryWiring.readTreasureMapItem()
→ QuestManager.onReadItem()
→ LocationKnowledge/navigation
```

### Cave prose

Preferowany flow:

```text
existing quest/cave binding
+ already resolved cave archetype
+ already available origin/target position
+ optional existing canonical location name
+ giver/speaker Role
→ cardinalDirectionPhrase()
→ pure player-facing formatter
→ quest/dialogue text
```

World/location systems pozostają właścicielem identity/nazwy/pozycji. Quest layer tylko konsumuje resolved presentation input.

---

## Performance guardrails

Location prose nie może powodować dodatkowego kosztownego world search.

Nie wykonywać tylko dla tekstu:

- skanowania świata,
- wyszukiwania jaskiń,
- terrain sampling,
- pathfindingu,
- raycastów,
- visibility checks,
- worker round-tripów,
- per-frame obliczeń.

Opis ma być zbudowany przy materializacji/bindingu questa z danych, które są już dostępne lub tanio przekazywalne przez istniejący seam.

---

## Non-goals

Ten plan nie obejmuje:

- nowego systemu wiedzy/memory NPC,
- proceduralnego LLM dialogue,
- losowych zmian tego, czy NPC zna nazwę miejsca,
- redesignu QuestManager,
- redesignu LocationKnowledge,
- nowego systemu mapy świata,
- nowych cave archetypes,
- zmian w cave geometry,
- pełnego redesignu wszystkich item categories,
- rozwiązania sprzedaży/wyrzucania aktywnych story itemów,
- pełnego narrative rewrite wszystkich questów.

---

## Testy

### Inventory / mapa

Dodać lub rozszerzyć testy potwierdzające:

- treasure map na liście ma `Odczytaj`,
- `Odczytaj` używa istniejącego `onRead`,
- book nadal ma `Czytaj`,
- zwykły item nie dostaje read action,
- details screen nadal ma działające `Odczytaj`.

### Kategorie

Sprawdzić:

- `ItemCategory` obsługuje `story` i `other`,
- `primaryItemCategory()` ma deterministyczny order,
- `useItemCategoryLabels()` zwraca `Fabularne` i `Inne`,
- story items mają `story`,
- filters/sorting inventory obsługują nowe kategorie,
- wszystkie exhaustive maps/icons/merchant surfaces kompilują się i mają sensowny fallback/icon.

### Cave formatter

Pure tests minimum:

```text
natural + NW + ordinary role
→ mała/niewielka jaskinia + północny zachód

adventure + N + ordinary role
→ głęboka/duża jaskinia + północ

dungeon + E + ordinary role
→ stary/rozległy loch + wschód

named location + hunter
→ może użyć nazwy własnej + kierunku

named location + farmer
→ nie ujawnia nazwy; używa archetypu + kierunku

no name + guard
→ fallback do archetypu + kierunku

no direction
→ poprawny neutralny fallback
```

Dodać test deterministyczności reguły roli: ten sam input daje ten sam tekst/variant.

### Quest integration

Reprezentatywnie sprawdzić minimum:

- lost hunter → natural cave,
- old bones → adventure cave,
- dungeon bandit lub lost expedition → dungeon,
- suspicious transport → natural cave.

Player-facing text nie może zawierać technicznych placeholderów typu:

```text
konkretna jaskinia
konkretny loch
dokładny loch
natural cave
adventure cave
dungeon
```

Nie zmieniać quest IDs ani outcome IDs.

---

## Verification

Agent implementujący:

1. uruchamia odpowiednie unit tests,
2. uruchamia TypeScript/build zgodnie z repo workflow,
3. nie wykonuje browser verification.

Manual browser verification wykonuje użytkownik:

- znaleźć mapę skarbu i potwierdzić widoczne `Odczytaj` na liście,
- odczytać mapę i potwierdzić obecny reveal/navigation flow,
- sprawdzić filtry `Fabularne` i `Inne`,
- sprawdzić quest prowadzący do natural cave,
- sprawdzić quest prowadzący do adventure cave,
- sprawdzić quest prowadzący do dungeon,
- porównać wypowiedź NPC z rolą pozwalającą użyć nazwy oraz zwykłego NPC,
- potwierdzić, że kierunek zgadza się z realnym położeniem celu.

## Dokumentacja

Jeżeli implementacja zmienia udokumentowany kontrakt `ItemCategory` lub quest location prose, zaktualizować odpowiednie `docs/state/*` / `docs/STATE.md` odsyłacze zgodnie z aktualnym podziałem dokumentacji.

Implementation notes powinny przed kodowaniem wskazać dokładne call-sites, źródło opcjonalnej nazwy world location oraz sposób przekazania `Role` do materializacji questów bez dodatkowych lookupów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
