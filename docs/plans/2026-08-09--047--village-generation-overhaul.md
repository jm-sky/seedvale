# Village Generation Overhaul

> **Implementation notes:** [2026-08-09--047--village-generation-overhaul-implementation-notes.md](./2026-08-09--047--village-generation-overhaul-implementation-notes.md)

## Goal

Przebudować generowanie wiosek tak, aby nie były zbiorem losowo rozmieszczonych obiektów, ale spójnymi, proceduralnie zaplanowanymi osadami.

Generator powinien tworzyć miejsce z własną strukturą, charakterem i historią.

## 1. Kontekst obecnego systemu

Świat jest generowany jako pierwszy: terrain, regions/biomes, forests i natural resources. Następnie wybierane jest miejsce osady, teren jest lokalnie modyfikowany, powstają place, a potem rozmieszczane są budynki i inne elementy.

Problemem jest zbyt losowy układ, słabe relacje między budynkami i brak nadrzędnego planu. Teren jest obecnie raczej przygotowywany pod obiekty niż planowany razem z osadą.

Istnieją już osobne mechanizmy dotyczące lokalizacji osady, rodzin i domów, wyrównywania terenu, ścieżek, livestock, props, miejsc NPC i ognisk. Potrzebna jest spójna warstwa planowania, która je połączy.

> **Wziąć pod uwagę poprzedni niedokończony plan:** `2026-08-08--036--village-siting-difficult-terrain.md`

## 2. Tożsamość wioski

```ts
VillageIdentity {
  type: VillageType
  size: VillageSize
  traits: VillageTrait[]
  history: VillageHistory
}
```

### Type

Określa, czym przede wszystkim żyje osada. Przykłady: `farming`, `forestry`, `fishing`, `mining`, `livestock`, `mixed`, `roadside`.

Typ wpływa na potrzeby i strukturę osady, a nie tylko na wygląd.

### Size

```ts
xs | sm | md | lg | xl
```

Rozmiar wpływa na wymagany obszar, liczbę stref, długość dróg, liczbę placów, infrastrukturę, liczbę mieszkańców i złożoność układu. XL powinno wymagać odpowiednio dużej i sensownej przestrzeni w świecie.

### Traits

Cechy określające charakter osady, np. `wealthy`, `poor`, `traditional`, `progressive`, `isolated`, `connected`, `orderly`, `organic`, `religious`, `militarized`, `resourceful`, `crowded`, `declining`, `growing`.

Traits powinny wpływać na sposób generowania wioski.

### History

Historia nie powinna być wyłącznie lore. Powinna mieć konsekwencje dla rzeczywistej struktury osady.

Przykłady: powstanie wokół starej studni, rozrost wzdłuż starego szlaku, częściowe zniszczenie przez pożar, przybycie nowych rodzin, wcześniejsza większa populacja i późniejszy upadek.

## 3. VillagePlan

Generator najpierw tworzy plan wioski, a dopiero potem konkretne obiekty.

```ts
VillagePlan {
  boundary
  terrainAreas[]
  zones[]
  landmarks[]
  roads[]
  plots[]
  buildings[]
}
```

`VillagePlan` powinien być rzeczywistym artefaktem generacji i wspólnym źródłem prawdy o przestrzeni osady. Docelowo może być wykorzystywany przez NPC, pathfinding, ekonomię, gameplay, save/load i debugowanie.

## 4. Pipeline generacji

```text
World
  ↓
Find settlement site
  ↓
Evaluate terrain/resources
  ↓
Create village identity
  ↓
Create village boundary
  ↓
Select village center
  ↓
Create zones
  ↓
Create roads / paths
  ↓
Prepare terrain
  ↓
Create plots
  ↓
Place buildings
  ↓
Place functional infrastructure
  ↓
Place decorative props
```

Docelowo: **plan → teren → infrastruktura → budynki → detale**.

## 5. Szersza przestrzeń

Generator powinien oceniać większy obszar, a nie tylko pojedynczy punkt. Należy uwzględniać dostępny obszar, nachylenie, wysokość, wodę, las, naturalne zasoby, przeszkody, możliwość stworzenia dróg i działek oraz wymagany obszar wynikający z `size`.

## 6. Centrum wioski

Wioska powinna mieć świadomie wybrany punkt centralny. Najczęściej będzie to centralny plac, studnia, ważny landmark lub skrzyżowanie głównych dróg.

Nie powinno być kilku przypadkowych placów. Dodatkowe place mogą istnieć, ale powinny wynikać z planu.

Układ powinien być organiczny, ale celowy.

## 7. Strefy

Budynki powinny być rozmieszczane przede wszystkim w ramach stref, np.:

- `residential`
- `production`
- `storage`
- `food`
- `livestock`
- `utility`
- `public`

Strefy wynikają z typu wioski, wielkości, zasobów, historii, traits i terenu.

## 8. Relacje między obiektami

Budynki nie powinny być niezależnymi punktami. Powinny mieć relacje, np.:

- rodzina → dom → miejsce pracy,
- gospodarstwo → stodoła/magazyn → dom gospodarza,
- livestock → pastwisko → gospodarstwo,
- wioska → studnia → przestrzeń publiczna,
- produkcja → magazyn → droga.

Relacje będą później przydatne również dla NPC, ekonomii i handlu.

## 9. Budynki

Budynki powinny mieć role, np. residential, production, food, livestock, utility i public. Ich obecność powinna wynikać z:

```text
VillageType
+ VillageSize
+ Resources
+ Traits
+ History
```

Nie wszystkie budynki występują w każdej wiosce.

## 10. Teren

Teren powinien być częścią planowania. Docelowo:

```text
find location
→ create village plan
→ determine required terrain areas
→ prepare terrain
→ create roads
→ place buildings
```

Należy rozróżnić obszary pod budynki, place, drogi, ścieżki, zagrody, pola i obszary gospodarcze. Wyrównanie powinno być lokalne i płynnie przechodzić w naturalny teren, zamiast tworzyć sztuczny płaski stół.

## 11. Drogi i ścieżki

Drogi powinny wynikać z planu. Główne połączenia powinny łączyć świat z bramą, bramę z centrum oraz centrum z ważnymi strefami i zasobami.

Drogi powinny uwzględniać wysokość, nachylenie, przeszkody i ważne punkty oraz być częścią przygotowania terenu.

## 12. Layout patterns

Nie należy próbować generować absolutnie wszystkiego od zera. Można mieć kilka podstawowych wzorców:

```ts
VillageLayoutPattern =
  | "central"
  | "linear"
  | "clustered"
  | "roadside"
  | "waterfront"
```

`VillageType`, `Traits`, `History` i teren mogą wpływać na wybór/wagę wzorca. Następnie wzorzec jest proceduralnie deformowany, aby zachować różnorodność przy kontrolowanej strukturze.

## 13. Placement przez scoring

Unikać prostego losowania pozycji. Kandydaci na lokalizacje powinni być oceniani m.in. pod kątem bliskości centrum i dróg, nachylenia, odpowiedniego zasobu oraz odległości od innych obiektów.

Przykładowo:

```text
+ blisko centrum
+ blisko odpowiedniej drogi
+ odpowiednie nachylenie
+ odpowiednia odległość od zasobu
+ odpowiednia odległość od innych obiektów

- za blisko innego budynku
- zbyt stromy teren
- przeszkoda
- zbyt daleko od wymaganej infrastruktury
```

Nie wymaga to skomplikowanego AI. Deterministyczny scoring + seed powinien wystarczyć.

## 14. Kontrolowana losowość

Losowość pozostaje ważna, ale powinna być deterministyczna, ograniczona regułami i zależna od typu, size, traits, history oraz terenu.

```text
seed
+
identity
+
world
↓
VillagePlan
```

Ten sam seed powinien generować ten sam plan.

## 15. Dekoracje i elementy funkcjonalne

Dopiero po ukończeniu struktury:

```text
plan
→ terrain
→ roads
→ buildings
→ functional props
→ decorative props
```

Elementy takie jak tablica ogłoszeń, pomnik, brama, ogniska, pochodnie, ławki, beczki, skrzynie i drewno powinny mieć kontekst przestrzenny.

Przykładowo: tablica → przestrzeń publiczna, studnia → przestrzeń publiczna, pomnik → plac, pochodnie → droga/brama, ognisko → miejsce spotkań, beczki → production/storage.

## 16. Debug visualization

Generator powinien mieć tryb debugowania pokazujący:

- boundary,
- village center,
- zones,
- roads,
- plots,
- building footprints,
- resource influence,
- terrain modifications,
- scoring kandydatów.

## 17. Najważniejsza zasada

Nie budować kolejnej kolekcji niezależnych funkcji losujących pozycje.

Zamiast:

```text
generateHomes()
generatePlaza()
generateRoads()
generateProps()
generateBarns()
```

które niezależnie wybierają pozycje, potrzebny jest wspólny plan:

```text
VillageIdentity
      ↓
VillagePlan
      ↓
┌───────────────┐
│ terrain       │
│ zones         │
│ roads         │
│ plots         │
│ buildings     │
│ landmarks     │
└───────────────┘
      ↓
NPC / economy / gameplay / rendering
```

**VillagePlan powinien być wspólnym źródłem prawdy o przestrzeni osady.**

## Docelowa wizja

```text
World
  +
Resources
  +
Terrain
  +
Village Type
  +
Size
  +
Traits
  +
History
        ↓
   Village Planner
        ↓
   Village Plan
        ↓
 Terrain + Roads + Buildings + Props
```

Generator nie powinien tworzyć po prostu „wioski z N budynkami”. Powinien tworzyć **osadę, która ma powód, żeby wyglądać właśnie tak**.
