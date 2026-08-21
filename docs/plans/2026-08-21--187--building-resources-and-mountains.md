# Plan: Building Resources & Mountains

**Created:** 2026-08-21
**Status:** `planned` 📋
**Priority:** 🔴 high · **Effort:** XL
**Depends on:** 181 ~~184~~ ~~111~~
**domain:** `items-player`
**tags:** [world-terrain]

## Cel

Ujednolicić podstawowy model drewna i materiałów budowlanych oraz rozszerzyć istniejącą geografię gór o większą skalę i charakterystyczne skaliste szczyty.

Zakres ma być oparty na istniejących systemach drzew, harvestingu, `ITEM_CATALOG`/capabilities, inventory, dropped/world items, budowania oraz terrain generation. Nie tworzyć równoległego systemu drewna, materiałów budowlanych ani generatora gór.

## Reconnaissance — aktualny stan

Przed implementacją potwierdzono kluczowe punkty w aktualnym codebase:

- `ITEM_CATALOG` jest centralnym źródłem definicji itemów i od planu 184 posiada capability query model; istnieją m.in. `wood_chopping` i `branch_trimming`.
- `branch` jest obecnym canonical itemem wynikającym z harvestingu drzew.
- Istnieje wspólny tree lifecycle/harvest flow (`TreeLifecycle` / `treeHarvest.ts`) i wcześniejszy axe/tree-harvesting plan 057; nowa implementacja powinna rozszerzyć istniejący flow zamiast tworzyć drugi system.
- Plan 184 jest zaimplementowany i pozostaje w `verification needed`; dlatego bonus narzędziowy powinien wykorzystać istniejące capability API.
- Plan 181 rozszerzył istniejący terrain generator o większe masywy górskie i jest nadal `in progress`; ten plan powinien być wykonywany po jego domknięciu, aby nie prowadzić równoległych zmian w mountain shaping.
- Istniejący system budowania i wcześniejszy plan 111 dostarczają aktualnego punktu integracji konstrukcji; nie należy tworzyć osobnego `BuildingStorage` tylko dla leżących materiałów.
- Plan 175 przewiduje przyszły ruszt do pieczenia; ten plan ma zapewnić wspólny mechanizm belek, a nie implementować całe gotowanie/ruszt.

## 1. Model drewna

Rozdzielić obecne znaczenie `branch` na dwa normalne `ItemKind`:

```text
DREWNO
 ├── branch
 └── beam
```

### Branch

- podstawowa metoda pozyskania: ręczne zbieranie,
- nóż lub siekiera mogą dawać istniejący bonus capability/tool-bonus,
- może być paliwem,
- może być materiałem do ręcznej pochodni / płonącej gałęzi,
- bez nowego systemu paliwa.

### Beam

- pozyskiwana wyłącznie przez ścięcie drzewa siekierą,
- może być paliwem w istniejącym systemie ognia,
- jest materiałem konstrukcyjnym,
- nie może być używana jako ręczna pochodnia/płonąca gałąź.

## 2. Harvest drzewa

Rozszerzyć istniejący tree harvest flow tak, aby pełne ścięcie drzewa zwracało oba materiały:

```text
ścięcie drzewa
      ↓
 ┌────┴────┐
 ↓         ↓
beam     branch
```

Podczas reconnaissance implementacyjnego ustalić minimalny model ilości:

- wykorzystać istniejące dane drzewa, jeżeli typ/rozmiar/wiek są już dostępne,
- zachować deterministyczną losowość, jeśli istniejący flow jej używa,
- ustalić sensowną przewagę belek nad gałęziami dla ściętego drzewa,
- nie dodawać nowego systemu parametrów drzew tylko dla dropu.

Drop powinien nastąpić w istniejącym authoritative final-harvest transition.

## 3. Branch gathering

Zachować obecne ręczne zbieranie gałęzi jako podstawową ścieżkę.

Ujednolicić bonus narzędziowy z `ITEM_CATALOG`/capabilities i nie tworzyć `BranchGatheringSystem` ani drugiego tree lifecycle.

## 4. Budowanie z materiałów świata

Istniejący system budowania powinien móc zużywać wymagane materiały znajdujące się na ziemi w pobliżu konstrukcji, bez konieczności przenoszenia ciężkich materiałów do inventory.

Preferowany przepływ:

```text
world item / dropped item
        ↓
near construction site
        ↓
existing building material query
        ↓
construction progress
        ↓
consume item at existing consumption boundary
```

W ramach reconnaissance ustalić istniejący owner dropped items, pickup/inventory APIs, pozycję/count itemów i miejsce obecnego sprawdzania/zużywania materiałów.

Zasady:

- nie tworzyć `BuildingStorage`, `ConstructionInventory` ani podobnego magazynu,
- nie teleportować materiałów do inventory,
- materiały mają zostać faktycznie zużyte jako world items,
- promień ma być mały i deterministyczny,
- nie skanować całego świata/per-frame; wykorzystać istniejący spatial/query mechanism,
- zużycie następuje zgodnie z istniejącym modelem progresu budowy.

## 5. Istniejące i przyszłe konstrukcje

Mechanizm ma być generyczny dla istniejących i przyszłych konstrukcji.

Zweryfikować integrację z istniejącą budową studni, generic building flow oraz przyszłym rusztem z planu 175. Nie implementować w tym planie całego planu 175.

## 6. Ogień i paliwo

Ponownie użyć istniejącego fuel/fire modelu:

- `branch` może zasilać istniejące ognisko,
- `beam` może zasilać istniejące ognisko,
- `beam` nie może być ręczną pochodnią,
- `branch` może być użyty w istniejącym torch/fire flow.

Nie tworzyć nowego `FuelSystem`.

## 7. Góry — skala

Rozszerzyć istniejący generator gór po planie 181.

Cel:

```text
wysokie, monumentalne góry
        ↓
skaliste zbocza
        ↓
górskie zbocza
        ↓
teren / roślinność
```

Góry powinny być wyraźnie wyższe względem drzew, zachowywać naturalną skalę i ciągłość masywów z planu 181. Bez sztucznych stożków/piramid i bez osobnego `MountainSystem`.

## 8. Ostre skaliste szczyty

Na najwyższych partiach istniejących masywów dodać/ukształtować większe, nieregularne skaliste formacje.

To nie ma być scatter pojedynczych kamieni. Formacje powinny mieć różne wysokości, rozmiary i nachylenia, być nieregularne, tworzyć naturalne skupiska, koncentrować się na najwyższych partiach i przechodzić w skaliste zbocza.

Preferować istniejące terrain height/biome/rock placement mechanisms. Nie tworzyć równoległego mountain-rock generatora bez konieczności.

## 9. Wydajność

Uwzględnić istniejące ograniczenia renderingu:

- nie zwiększać gwałtownie draw calls przez pojedyncze obiekty,
- preferować istniejące instancing/merged geometry/LOD,
- generować formacje deterministycznie i lokalnie w chunk/worker pipeline,
- nie tworzyć globalnej geometrii gór,
- sprawdzić triangles, draw calls i chunk generation/streaming hitching.

## 10. Kolejność implementacji

### Etap A — reconnaissance implementacyjny

Potwierdzić entry points dla tree harvest/yield, branch gathering, item capabilities, world/dropped items, building material requirements/consumption, well construction, fire fuel, mountain shaping, rock/formations oraz chunk/worker rendering. Ustalić yield `beam:branch` i promień pobierania materiałów.

### Etap B — branch / beam model

Dodać `beam`, zachować `branch`, rozszerzyć tree harvest o oba dropy, wykorzystać istniejące item/fuel/torch mechanisms i capability bonusy.

### Etap C — world materials for construction

Rozszerzyć istniejący building material query, umożliwić pobieranie wymaganych itemów z ziemi w pobliżu, zużywać je na istniejącej granicy progresu budowy i sprawdzić studnię oraz przygotowanie pod przyszłe konstrukcje.

### Etap D — mountain scale and rocky peaks

Zwiększyć skalę/wysokość gór w istniejącym generatorze, zbudować większe skaliste szczyty z istniejącego terrain/rock pipeline i ocenić kilka seedów.

### Etap E — performance and regression verification

Build/test/lint/tsc, browser/manual verification gameplay, rendering metrics, kilka seedów i granice chunków oraz brak regresji construction/fire/tree lifecycle.

## Poza zakresem

- nowy generalny crafting system,
- osobny system drewna/wood manager,
- osobny system building storage,
- pełny overhaul tree lifecycle,
- pełny fuel overhaul,
- nowy globalny mountain generator,
- pełna przebudowa hydrologii/rzek z planu 181,
- nowe systemy ekonomii materiałów,
- niezwiązany cleanup/refactor.

## Weryfikacja

### Techniczna

```text
pnpm tsc --noEmit
pnpm lint:fix
pnpm build
pnpm test
```

### Gameplay / browser

- ręczne zbieranie `branch` działa,
- nóż/siekiera wykorzystują istniejący bonus capability, jeśli przewidziany,
- ścięcie drzewa siekierą daje `beam + branch`,
- `beam` nie działa jako ręczna pochodnia,
- oba materiały działają w istniejącym systemie paliwa,
- konstrukcja może zużyć materiały leżące w ustalonym promieniu,
- ciężkie materiały nie muszą być w inventory,
- materiały nie są zużywane przed właściwym etapem progresu,
- studnia działa bez regresji,
- przyszły ruszt ma jasno określony punkt integracji z `beam`,
- góry są wyraźnie wyższe względem drzew,
- najwyższe partie mają monumentalne, ostre i nieregularne formacje,
- formacje tworzą naturalne skupiska i przejścia zamiast scatteru kamieni,
- kilka seedów zachowuje deterministyczny i naturalny rezultat.

### Performance

Sprawdzić terrain/chunk generation time, draw calls, triangles, memory/GC jeśli wzrost geometrii jest istotny oraz streaming hitching.

Oddzielić w implementation notes: implemented, technically verified, browser/manual verified.

**Zrób git commit i push do main, rebase jeżeli trzeba**
