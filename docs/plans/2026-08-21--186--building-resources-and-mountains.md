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
- Plan 184 jest zaimplementowany i pozostaje w `verification needed`; dlatego bonus narzędziowy powinien wykorzystać istniejące capability API, a nie dodawać kolejny helper narzędziowy.
- Plan 181 rozszerzył istniejący terrain generator o większe masywy górskie i jest nadal `in progress`; ten plan powinien być wykonywany po jego domknięciu, aby nie prowadzić równoległych zmian w mountain shaping.
- Istniejący system budowania i wcześniejszy plan 111 dostarczają aktualnego punktu integracji konstrukcji; nie należy tworzyć osobnego `BuildingStorage` tylko dla leżących materiałów.
- Plan 175 przewiduje przyszły ruszt do pieczenia i wymaga materiałów konstrukcyjnych; ten plan ma zapewnić wspólny mechanizm belek, a nie implementować całe gotowanie/ruszt.

## 1. Model drewna

Rozdzielić obecne znaczenie `branch` na dwa normalne `ItemKind`:

```text
DREWNO
 ├── branch
 └── beam
```

### Branch

`branch` pozostaje lekkim, ręcznie zbieranym materiałem.

- podstawowa metoda pozyskania: ręczne zbieranie,
- nóż lub siekiera w ekwipunku może dawać istniejący bonus capability/tool-bonus,
- może być paliwem,
- może być materiałem do ręcznej pochodni / płonącej gałęzi,
- nie wymaga nowego systemu paliwa.

Dokładny sposób reprezentacji bonusu ma wynikać z istniejącego capability/tool-bonus flow; nie dodawać specjalnego `BranchGatheringSystem`.

### Beam

`beam` jest ciężkim materiałem z drzewa.

- pozyskiwanie wyłącznie przez ścięcie drzewa siekierą,
- może być paliwem w istniejącym systemie ognia,
- może być materiałem konstrukcyjnym,
- nie może być używany jako ręczna pochodnia/płonąca gałąź.

Nie tworzyć osobnego systemu fuel tylko dla `beam`.

## 2. Harvest drzewa

Rozszerzyć istniejący tree harvest flow tak, aby pełne ścięcie drzewa zwracało oba materiały:

```text
ścięcie drzewa
      ↓
 ┌────┴────┐
 ↓         ↓
beam     branch
```

### Yield

Podczas reconnaissance implementacyjnego ustalić minimalny model ilości:

- bazować na istniejących danych drzewa, jeżeli typ/rozmiar/wiek są już dostępne,
- zachować sensowną losowość deterministyczną, jeżeli istniejący harvest flow ma seed-based randomness,
- ustalić sensowną przewagę belek nad gałęziami dla ściętego drzewa,
- nie dodawać nowego systemu parametrów drzew tylko po to, aby sterować dropem.

Jeżeli obecny lifecycle rozróżnia kolejne etapy ścinania, drop powinien nastąpić w istniejącym authoritative final-harvest transition.

## 3. Branch gathering

Zachować obecne ręczne zbieranie gałęzi jako podstawową ścieżkę.

Sprawdzić istniejące interakcje drzew i branch gathering oraz ujednolicić bonus narzędziowy z `ITEM_CATALOG`/capabilities.

Nie usuwać bez potrzeby istniejącej ręcznej interakcji drzewa. Jeżeli obecne zachowanie łączy inspekcję drzewa z okazjonalnym branch yield, rozdzielić tylko tyle, ile jest konieczne, aby:

- ręczne zbieranie pozostało dostępne,
- pełne ścięcie dawało `beam + branch`,
- axe harvest nie tworzył drugiego tree lifecycle.

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

W ramach reconnaissance ustalić:

- istniejący typ/owner dropped world items,
- istniejące pickup/inventory APIs,
- sposób przechowywania item position i count,
- miejsce, w którym building obecnie sprawdza/zużywa materiały.

Następnie rozszerzyć istniejący mechanizm tak, aby konstrukcja mogła znaleźć odpowiedni `ItemKind` w ustalonym promieniu.

### Zasady

- nie tworzyć `BuildingStorage`, `ConstructionInventory` ani podobnego równoległego magazynu,
- nie teleportować materiałów do inventory,
- materiały mają zostać faktycznie zużyte jako istniejące world items,
- promień powinien być mały i deterministyczny względem pozycji konstrukcji,
- nie skanować całego świata/per-frame; wykorzystać istniejący spatial/query mechanism,
- zużycie ma następować zgodnie z istniejącym modelem progresu budowy, a nie już przy samym rozpoczęciu interakcji.

## 5. Istniejące i przyszłe konstrukcje

Mechanizm ma być generyczny dla istniejących i przyszłych konstrukcji.

Zweryfikować integrację z:

- istniejącą budową studni,
- obecnym generic building flow,
- planowanym rusztem do pieczenia z planu 175,
- przyszłymi konstrukcjami wymagającymi `beam`.

Nie implementować w tym planie całego planu 175. Ruszt powinien po prostu móc skorzystać z generycznego materiału `beam` i mechanizmu pobierania materiałów świata, gdy plan 175 zostanie wdrożony.

## 6. Ogień i paliwo

Ponownie użyć istniejącego fuel/fire model.

- `branch` może zasilać istniejące ognisko,
- `beam` może zasilać istniejące ognisko,
- `beam` nie może być traktowany jako ręczna pochodnia,
- `branch` może być użyty do stworzenia ręcznej pochodni/płonącej gałęzi zgodnie z istniejącym fire/torch flow.

Nie tworzyć nowego `FuelSystem` ani osobnego typu paliwa dla drewna.

## 7. Góry — skala

Rozszerzyć istniejący generator gór, który został już dostrojony w planie 181.

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

Wymagania:

- góry wyraźnie wyższe względem istniejących drzew,
- zachowanie naturalnej skali świata,
- ciągłość masywów z planu 181,
- brak sztucznych stożków/piramid,
- nie przywracać drobnego noise jako źródła ostrych, przypadkowych pików.

Nie tworzyć osobnego `MountainSystem`.

## 8. Ostre skaliste szczyty

Na najwyższych partiach istniejących masywów dodać/ukształtować większe, nieregularne skaliste formacje.

To nie ma być scatter pojedynczych kamieni. Formacje mają być częścią czytelnej hierarchii terenu:

```text
        ostry skalisty szczyt
                  ↓
          skaliste zbocze
                  ↓
          górskie zbocze
                  ↓
            niższy teren
```

Formacje powinny:

- mieć różne wysokości,
- mieć różne rozmiary,
- mieć różne nachylenia,
- być nieregularne,
- tworzyć naturalne skupiska,
- koncentrować się na najwyższych partiach,
- przechodzić w skaliste zbocza zamiast kończyć się pojedynczymi kamieniami.

Preferowana implementacja powinna wykorzystać istniejące terrain height/biome/rock placement mechanisms. Jeżeli istniejące rock props są tylko dekoracyjnym scatterem, najpierw sprawdzić, czy można rozszerzyć ich authoring/generowanie; nie tworzyć równoległego mountain-rock generatora bez potrzeby.

## 9. Wydajność terenu i skał

Uwzględnić istniejące ograniczenia renderingu:

- nie zwiększać gwałtownie liczby draw calls przez pojedyncze obiekty skalnych formacji,
- preferować istniejące instancing/merged geometry/LOD mechanisms,
- generować formacje deterministycznie i lokalnie w istniejącym chunk/worker pipeline,
- nie tworzyć globalnej geometrii gór,
- sprawdzić wpływ większych gór i skał na triangles, draw calls i chunk generation.

Weryfikacja wydajności ma być oparta na rzeczywistych metrykach, nie na założeniu, że dodatkowa geometria będzie tania.

## 10. Kolejność implementacji

### Etap A — reconnaissance implementacyjny

Przed zmianami potwierdzić konkretne entry points dla:

- tree harvest/yield,
- branch gathering,
- item catalog/capabilities,
- world/dropped items,
- building material requirements/consumption,
- well construction,
- fire fuel,
- terrain mountain shaping,
- rock/formations,
- chunk/worker rendering.

Na tym etapie ustalić również dokładny yield `beam:branch` i promień pobierania materiałów.

### Etap B — branch / beam model

- dodać `beam` jako normalny item,
- zachować `branch` jako osobny item,
- rozszerzyć tree harvest o oba dropy,
- wykorzystać istniejące item/fuel/torch mechanisms,
- podłączyć capability bonusy bez tworzenia nowych helperów narzędziowych.

### Etap C — world materials for construction

- rozszerzyć istniejący building material query,
- umożliwić pobieranie wymaganych itemów z ziemi w pobliżu,
- zużywać je na istniejącej granicy progresu budowy,
- sprawdzić studnię i przygotowanie pod przyszłe konstrukcje.

### Etap D — mountain scale and rocky peaks

- zwiększyć skalę/wysokość gór w istniejącym generatorze,
- zbudować większe skaliste szczyty z istniejącego terrain/rock pipeline,
- zapewnić naturalne przejście szczyt → skała → zbocze → teren,
- ocenić kilka seedów.

### Etap E — performance and regression verification

- build/test/lint/tsc,
- browser/manual verification gameplay,
- rendering metrics,
- kilka seedów i granice chunków,
- brak regresji existing construction/fire/tree lifecycle.

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
- nóż/siekiera wykorzystują istniejący bonus capability, jeśli jest przewidziany dla danego flow,
- ścięcie drzewa siekierą daje `beam + branch`,
- `beam` nie działa jako ręczna pochodnia,
- oba materiały działają w istniejącym systemie paliwa zgodnie z założeniami,
- konstrukcja może zużyć odpowiednie materiały leżące w ustalonym promieniu,
- ciężkie materiały nie muszą być przenoszone do inventory,
- materiały nie są zużywane przed właściwym etapem progresu,
- studnia działa bez regresji,
- przyszły ruszt ma jasno określony punkt integracji z `beam`,
- góry są wyraźnie wyższe względem drzew,
- najwyższe partie mają monumentalne, ostre i nieregularne formacje,
- formacje tworzą naturalne skupiska i przejścia zamiast scatteru kamieni,
- kilka seedów zachowuje deterministyczny i naturalny rezultat.

### Performance

Sprawdzić wpływ na:

- terrain/chunk generation time,
- draw calls,
- triangles,
- memory/GC, jeżeli wzrost geometrii jest istotny,
- streaming hitching.

Oddzielić w implementation notes:

- implemented,
- technically verified,
- browser/manual verified.

**Zrób git commit i push do main, rebase jeżeli trzeba**
