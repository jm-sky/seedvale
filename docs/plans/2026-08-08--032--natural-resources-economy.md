# Plan: Natural Resources, Food & Village Economy

**Status:** `verification needed` 🔍 — checklist §14 punkty 1-6, 8-9 zaimplementowane 2026-08-10, punkt 7 (outposts) zaimplementowany jako opcjonalny/warunkowy mechanizm; wymaga wizualnej weryfikacji w przeglądarce na kilku ziarnach (patrz „Stan implementacji" niżej).
**Created:** 2026-08-08
**Scope:** kolejny etap po generowaniu wiosek ([village-generation.md](./2026-08-08--031--village-generation.md)), rozszerza [multi-settlements.md](./2026-08-07--025--multi-settlements.md) (tam „dystrybucja zasobów per wioska" jest jawnie poza zakresem v1 — to jest ten plan)

> Draft od ChatGPT, bez dostępu do plików repo. Review przed implementacją — patrz „Review" niżej.

## Update (2026-08-10, wieczór): pierwsza widoczna geometria zasobów

Pierwotna implementacja (sekcja niżej) świadomie nie miała **żadnej** geometrii w świecie — zasoby były czystą warstwą danych na czas generowania osady. Na życzenie użytkownika ("Chcę jakieś wizualnie widoczne geometrie/przedmioty") dodano pierwszą warstwę wizualną, bez interakcji:

- **Kupki rudy** — `src/terrain/resourceDeposits.ts` (nowy): main-threadowy system strumieniowania po dystansie od gracza (wzorzec `SettlementsManager`/`ItemSpawners`, nie pipeline workera terenu — `naturalResources.ts` już działa na próbkach z `ChunkManager` wystawionych na główny wątek, ten sam trik co `audio/ambientWeights.ts`). Dla każdego znaczącego złoża **żelaza/węgla/złota** (dodano nowy typ `coal` — `naturalResources.ts`, rola `miner` jak iron/gold) w promieniu ~160 jedn. od gracza: 2-3 kupki po 3-4 kamienie (`createRockCluster` z `settlement/props.ts`, rozszerzone o opcjonalny `color`: rdzawy dla żelaza, prawie czarny dla węgla, złoty dla złota) + etykieta z polską nazwą (`.npc-label`, jak przy itemach/NPC). Bez interakcji — czysto dekoracyjne, zgodnie z życzeniem ("Mogą być bez interakcji").
- **Pole pszenicy** — `settlement/props.ts::createWheatField`: gęsty krąg cienkich, żółtych, wysokich "źdźbeł" (stożki, ten sam styl co `createReed`, ale węższe i wyższe, kolor `0xd8b23c`) obok ogródka (`garden`), tylko dla osad z `foodSourceType === 'field'` (znaczący `fertile_soil` w pobliżu). Nie zastępuje istniejącego `garden` propa — dokłada się obok niego.
- **Ważna poprawka spójności przy okazji**: `settlementGenerator.ts` próbkowało warstwę zasobów seedem **per-komórka osady** (`seedForCell`) zamiast surowym seedem świata — to samo miejsce w świecie mogło więc zwrócić różne zasoby w zależności od tego, która wioska pytała. Naprawione na zwykły `seed` (world seed), zgodnie z §1 planu ("Zasoby są generowane niezależnie od wiosek") — istotne teraz, gdy ten sam layer jest odpytywany zarówno przy generowaniu osady, jak i przez `resourceDeposits.ts` z pozycji gracza; bez tej poprawki kupka rudy w terenie mogłaby nie odpowiadać złożu, które wpłynęło na daną wioskę.
- Nadal poza zakresem: zbieranie/inventory zasobów, `clay`/`salt`/`resin`/`herbs` bez wizualizacji (świadomie pominięte — brak naturalnej roli/koloru bez wymyślania na siłę).

`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` — czyste. Wizualna weryfikacja w przeglądarce nadal potrzebna (kupki rudy w górach, pole pszenicy przy wiosce z polem).

## Stan implementacji (2026-08-10)

Zaimplementowane wg checklisty §14, z konkretnymi decyzjami technicznymi tam, gdzie plan zostawiał otwarte pytanie:

1. **Generowanie zasobów** — `src/terrain/naturalResources.ts` (nowy). Własna, rzadsza siatka (`RESOURCE_GRID_STEP = 90`, gęstsza niż `SETTLEMENT_GRID_STEP = 280`) z deterministycznym per-komórkowym seedem (ten sam xor/imul-hash idiom co `settlementGenerator.ts::cellSeed`), próbkowana on-demand (`resourcesNear`/`dominantResourceNear`) — bez pregeneracji/streamingu, bez geometrii w świecie (patrz punkt „Poza zakresem" niżej). Pula typów zawężona do 8 (`iron`/`gold`/`fish`/`fertile_soil`/`clay`/`salt`/`resin`/`herbs`) — generyczne drewno/kamień świadomie pominięte, bo teren już ma las/skały jako ambient (uzasadnienie w komentarzu modułu).
2. **Preferencje terenowe** — `resourceWeights()` w tym samym pliku, komponuje istniejące osie (`continentalness`/`mountainRidge`/`moistureRegion` przez `biomeWeightsAt`) zamiast nowego podziału biomów, zgodnie z uwagą z „Review" wyżej. „Blisko wody" (rzeki/jeziora/wybrzeże) wykrywane przez ring-scan wokół kandydata (`isNearWater`, promień 24 jedn.) — taki sam wzorzec jak `villageClearing.ts::pathIsDry`.
3. **Richness** — `0.2 + fit*0.5 + losowość*0.3`, `fit` = dopasowanie wylosowanego typu do środowiska względem najlepszego możliwego w tym miejscu.
4. **Wpływ na atrakcyjność lokalizacji** — `findSettlementSite.ts` dostał opcjonalny param `resourceAttraction?: (x,z) => number`; `settlementGenerator.ts` skanuje zasoby w promieniu `localSearchRadius + 130` wokół `center` *przed* wyszukiwaniem site'u i przekazuje bonus do scoringu (waga `RESOURCE_SCORE_WEIGHT = 3`, porównywalna z karą za nierówność terenu) — **tylko ranking między już zaakceptowanymi płaskimi/suchymi kandydatami**, nigdy nie omija bramki płaskość/woda. Świadoma decyzja z „Review": nie zmienia się „czy w ogóle powstaje wioska w tej komórce" (dziś każda komórka siatki osad zawsze dostaje jakąś osadę) — tylko *które* miejsce w obrębie komórki zostanie wybrane.
5. **Dedykowana rodzina + domek** — `families.ts::generateFamilies` dostał opcjonalny param `dominantResource`; przy istotności `>= SIGNIFICANT_RICHNESS (0.55)` i typie z mapowaniem na rolę (`RESOURCE_ROLE`: `iron`/`gold` → `miner`, `fish` → `fisher`, `fertile_soil` → `farmer` — nowe role w `ai/characters.ts`) dokłada jedną dodatkową rodzinę (normalny roll single/para/dziecko, wymuszona rola tylko na pierwszym dodanym członku). `clay`/`salt`/`resin`/`herbs` nie mają mapowania na rolę — zostają czystym smaczkiem nazewniczym/food-source (nie wymyślano sztucznej roli na siłę). Dom przydziela się automatycznie — `villageClearing.ts::layoutClearings` już liczy pierścień domów z `families.length`, więc dodatkowa rodzina = dodatkowy dom bez żadnej zmiany w tamtym module.
6. **Resource Outposts** — `VillageSize` rozszerzony o `'OUTPOST'` (`families.ts`) — nigdy nie losowany przez `rollVillageSize` (zwraca teraz `Exclude<VillageSize, 'OUTPOST'>`), tylko jawnie ustawiany przez `settlementGenerator.ts`, gdy: `!isHome && terrain === 'mountain' && dominantResource.richness >= 0.78 && RESOURCE_ROLE[type] !== undefined` + rzut `OUTPOST_CHANCE = 0.45` (żeby nie każda kwalifikująca się góra+złoto kombinacja została outpostem — „Opcjonalne"). Outpost = dokładnie 1 rodzina, 1 osoba, `relation: 'single'`, wymuszona rola. Nadal dostaje standardowy rdzeń (studnia/skład/ogród) — bez tego istniejący system potrzeb NPC (`beginNeed`/`goWell`/`goGarden`/`goStock`) nie miałby czego użyć — ale **bez ogniska** (`props.ts`: warunek zmieniony z `size !== 'SM'` na jawne `size === 'MD' || size === 'LG'`, żeby nie objąć przy okazji outpostu).
7. **Wpływ na nazwę** — `shared/SettlementName.ts::generateSettlementName` dostał opcjonalny 3. param `dominantResource`; przy istotnym zasobie (ten sam próg `SIGNIFICANT_RICHNESS`) i typie z wpisem w nowej `RESOURCE_WORDS` (polskie fragmenty, nie dosłowne tłumaczenia angielskich przykładów z planu — np. „Żelazna Kuźnia" zamiast „Ironvale", zachowuje konwencję nazewniczą reszty gry) — 50% szans (`RESOURCE_NAME_CHANCE`) na wmieszanie zasobowych przymiotników/rzeczowników do puli przed wylosowaniem wzorca terenowego. `soloNames` zostają czysto terenowe.
8. **Food Source** — `settlementGenerator.ts::foodSourceTypeFor` — dane, nie nowa geometria (patrz „Poza zakresem"): `fish`/`fertile_soil` istotne → `fishing`/`field`; teren `forest` → `foraging`; reszta → `garden` (dzisiejszy domyślny prop, bez zmian wizualnych). Nowe pole `SettlementDef.foodSourceType`, przeniesione na `Settlement` (`createSettlement.ts`), skonsumowane w ekranie Mieszkańcy — badge przy nazwie osady (`ui/createVillagersScreen.ts`, widoczny tylko gdy >1 wioska załadowana, tak jak istniejący badge nazwy osady).
9. **Przygotowanie danych pod production/goods** — uznane za pokryte samym modelem `NaturalResource`/`SettlementDef.dominantResource` (typ zasobu + richness już dostępne dla przyszłych konsumentów) — brak dodatkowego kodu.

Testy: `src/terrain/naturalResources.test.ts` (nowy — determinizm, sparsity, `richness` w [0,1], bias iron/gold→góry i resin/herbs→las, `resourceAttractionAt`), `src/settlement/families.test.ts` (rozszerzony — dedykowana rodzina, próg istotności, brak mapowania roli, ścieżka OUTPOST). `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` — czyste.

### Świadome odstępstwa od dosłownego brzmienia planu

- **Brak interakcji/inventory dla zasobów** (geometria częściowo już jest — patrz „Update 2026-08-10, wieczór" na górze pliku: kupki rudy + pole pszenicy, czysto dekoracyjne) — `NaturalResource` nadal nie jest zbieralnym/interaktywnym obiektem, spójne z §4: „Na tym etapie nie tworzymy jeszcze pełnego inventory zasobu". Gracz widzi teraz *gdzie* jest złoże (kupka rudy + etykieta), ale nie może go jeszcze wykopać/zebrać.
- **§5 „szansa na wioskę"** zinterpretowane jako wpływ na *wybór miejsca w obrębie już istniejącej komórki siatki osad*, nie na to, czy komórka w ogóle dostaje osadę — dzisiejszy `SettlementsManager`/`generateSettlementDef` nie ma pojęcia „pusta komórka bez osady" i dodanie go byłoby osobną, większą zmianą architektoniczną (streaming, minimapa, itd.), nieproporcjonalną do tego pojedynczego punktu planu.
- **Outpost nadal ma studnię/skład/ogród** (nie tylko „1 domek" z przykładu) — wymagane przez dzisiejszy system potrzeb NPC, który nie ma trybu „brak potrzeb". Bez ogniska.
- **`plantForest` dla outpostów bez zmian** (nadal dostają standardowy pas lasu jak każda mała osada) — świadomie nieruszane w tej turze, potencjalny drobny dalszy smaczek („samotna chatka w lesie/na przełęczy górskiej" zamiast pełnego zagajnika) do rozważenia przy kolejnej iteracji, nie blokujący.

## Review (2026-08-08, Claude) — vs. realia kodu

- **Kolejność generacji `teren → środowisko → zasoby → wioski` to zmiana kierunku, nie tylko dodatek.** Dziś jest odwrotnie: `findSettlementSite` ([settlementGenerator.ts](../../src/settlement/settlementGenerator.ts)) szuka płaskiego, safe miejsca (nachylenie/woda/biom), a `families.ts`/`villageClearing.ts` dopiero potem dopasowują teren pod wioskę — zasoby naturalne nigdzie dziś nie wpływają na wybór lokalizacji. Sekcja 5 tego planu („zasób → atrakcyjność lokalizacji → szansa na wioskę") wymaga więc realnego wpięcia w `findSettlementSite`, nie tylko nowej warstwy danych obok.
- **`biomeWeightsAt`/`moistureRegion`** ([biomeRegions.ts](../../src/terrain/biomeRegions.ts), [chunkHeightmap.ts](../../src/terrain/chunkHeightmap.ts)) już dają dokładnie ten sygnał środowiskowy, którego sekcja 3 („zasób ↔ preferowane środowisko") potrzebuje (las/bagno/pustynia/wybrzeże/góry) — `NaturalResource` powinien próbkować ten istniejący axis, nie wynajdywać nowy podział biomów.
- **Nazewnictwo wiosek już istnieje.** [SettlementName.ts](../../src/shared/SettlementName.ts) generuje nazwy terrain-flavored, wpięte w `settlementGenerator.ts`/minimap/panel Mieszkańcy (patrz [npc-names.md](./2026-08-07--027--npc-names.md)). Sekcja 9 (`terrain + dominant resource + seed`) to rozszerzenie istniejącej funkcji, nie nowy system — do zrobienia ostrożnie, żeby nie rozjechać już działającego mechanizmu.
- **Dedykowana rodzina zasobu (sekcja 6) pasuje wprost do istniejącego systemu rodzin** ([families.ts](../../src/settlement/families.ts): `generateFamilies`/`FamilyDef`) — plan sam to zauważa („rodzina jest częścią normalnego systemu rodzin, nie tworzymy osobnego typu NPC"), zgodne z decyzją projektu o jednym systemie zamiast równoległych (patrz `HealthState`/`CharacterDef` w [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md)) — dobry wzorzec do utrzymania tutaj też.
- **Resource Outpost (sekcja 7) to nowy rodzaj osady, mniejszy niż dzisiejsze SM.** `rollVillageSize` w `families.ts` dziś generuje tylko SM/MD/LG — outpost (1 dom, 1 samotny NPC, `relation: 'single'`) to nowy dolny próg, nie mieści się w obecnym zakresie rozmiarów bez zmiany.
- **Sekcja 8 (Food Source) częściowo już pokryta.** NPC-e dziś mają need „food" zaspokajany przez wspólny `garden` ([props.ts](../../src/settlement/props.ts)) — jeden typ źródła żywności dla całej osady, niezależnie od terenu. Ten plan chce to zróżnicować per-środowisko (pole/sad/rybołówstwo/zbieractwo) — realna zmiana w `SettlementLandmarks`, nie tylko w danych.
- **Sekcja 10-12 (crafting/production/goods/handel) to zakres wyraźnie odłożony przez sam plan** (patrz sekcja 14) — słusznie, bo to spory, osobny system (produkcja → dobra → potrzeby → nadwyżka/deficyt → barter) zależny od wszystkiego wcześniej. Nie zaczynać przed tym, jak sekcje 1-9 wylądują i będą zweryfikowane w przeglądarce.
- **Gracz-owy inventory to osobny, nie ten sam system.** Sekcja 14 wyklucza „pełny crafting, inventory, ekonomię i handel" z v1 — to poprawnie odkłada gospodarkę *wioski* (production/goods/trade między NPC), ale warto rozróżnić od **inventory gracza**: dziś `src/items/Inventory.ts` to prosty `Map<ItemKind, number>` bez żadnego pojęcia wagi/pojemności (gracz może nosić nieograniczoną liczbę muszli/kamieni/gałęzi/grzybów/kwiatów/szyszek, patrz [quests-v2-world-interactions.md](./2026-08-07--018--quests-v2-world-interactions.md)). **Inventory system z limitem wagowym (weight capacity) dla przedmiotów noszonych przez gracza** to osobna, jeszcze niezaplanowana funkcja — nie część tego planu (który dotyczy zasobów/gospodarki *wiosek*, nie gracza), ale naturalny przyszły konsument tych samych `ItemKind`/`goods`, gdy crafting/handel z sekcji 10-12 kiedyś wyląduje. Wart osobnego planu, nie dopisywania tutaj na siłę. Część tej przyszłej funkcji: usunąć tekstowe liczniki przedmiotów z HUD (`data-inventory` w `src/ui/createHud.ts`) na rzecz dedykowanego ekranu Inventory w menu (wzorzec `createPauseMenu.ts`/`createVillagersScreen.ts`), zamiast dokładać kolejne liczniki na główny ekran.

## 1. Idea

Świat nie powinien być generowany pod wioski.

Najpierw powstaje:

teren → środowisko → zasoby → wioski

Wioska pojawia się w świecie, który już posiada określone możliwości przetrwania i produkcji.

Zasoby mogą wpływać na:

- lokalizację wioski,
- jej wielkość,
- rodziny i role NPC,
- budynki i miejsca pracy,
- źródła żywności,
- nazwę wioski,
- przyszłą produkcję i handel.

Nie budujemy jeszcze pełnego systemu ekonomii. Tworzymy fundament, który pozwoli go później naturalnie rozwinąć.

---

## 2. Natural Resources

Zasoby są generowane niezależnie od wiosek.

Przykładowe zasoby:

**Żywność**

- zboże / żyzna gleba
- warzywa
- owoce
- jagody
- grzyby
- ryby
- dzikie zwierzęta
- zwierzęta hodowlane

**Materiały**

- drewno
- kamień
- glina
- żelazo
- węgiel

**Rzadkie / wartościowe**

- złoto
- kamienie szlachetne
- korale
- sól

**Naturalne specjalistyczne**

- żywica
- zioła
- inne zasoby zależne od biomu

Pula na początku powinna być niewielka i możliwa do późniejszego rozszerzania.

---

## 3. Zasoby zależne od terenu

Każdy zasób ma preferowane środowisko.

Przykłady:

| Zasób | Preferowane miejsce |
|-------|---------------------|
| Węgiel | góry, skały |
| Żelazo | góry, skały |
| Złoto | góry, rzeki |
| Sól | wybrzeże, wyschnięte jeziora |
| Żyzna gleba | okolice rzek i jezior |
| Ryby | jeziora, rzeki, morze |
| Korale | wybrzeże, płytka woda |
| Żywica | las |
| Grzyby | bagno, wilgotny las |
| Zioła | łąki, las, okolice wody |
| Glina | brzegi rzek i jezior, bagno |
| Drewno | las |
| Kamień | góry, skały |

Preferencja nie powinna być twardym ograniczeniem.

Zasób może pojawić się również poza swoim idealnym środowiskiem, ale z mniejszym prawdopodobieństwem.

---

## 4. Model zasobu

Minimalny model:

```ts
NaturalResource {
  type
  position
  radius
  richness
}
```

„richness" określa, jak znaczące jest dane źródło.

W przyszłości może wpływać na:

- wielkość produkcji,
- atrakcyjność dla osady,
- liczbę NPC zajmujących się zasobem,
- znaczenie handlowe.

Na tym etapie nie tworzymy jeszcze pełnego inventory zasobu.

---

## 5. Wioska a zasoby

Wioska nie musi znajdować się przy zasobie.

Znaczący zasób w pobliżu zwiększa jednak prawdopodobieństwo powstania wioski w tym miejscu.

Czyli:

```
zasób
  ↓
atrakcyjność lokalizacji
  ↓
szansa na wioskę
```

Bez twardego capu i bez wymuszania, że każda wioska musi mieć zasób specjalistyczny.

---

## 6. Dedykowana rodzina zasobu

Jeżeli wioska znajduje się wystarczająco blisko znaczącego zasobu, może otrzymać:

**1 dedykowaną rodzinę + 1 dedykowany domek.**

Przykłady:

```
żelazo
→ rodzina górnicza
→ domek / miejsce pracy

żyzna gleba
→ rodzina rolnicza
→ gospodarstwo / pole

jezioro
→ rodzina rybacka
→ domek / miejsce połowu

las
→ rodzina drwali
→ domek / miejsce pozyskiwania drewna
```

W v1:

- jeden zasób → maksymalnie jedna dedykowana rodzina,
- rodzina jest częścią normalnego systemu rodzin,
- nie tworzymy osobnego typu NPC „resource worker".

Rola NPC wynika więc częściowo z możliwości konkretnego miejsca.

---

## 7. Trudno dostępne zasoby

Niektóre zasoby mogą znajdować się w miejscu, gdzie nie ma sensu generować całej wioski.

Przykład:

```
złoto
↓
wysokie góry
↓
zbyt trudne miejsce na wioskę
```

W takim przypadku możliwy jest mały:

**Resource Outpost**

- 1 domek,
- 1 samotny NPC,
- powiązanie z konkretnym zasobem.

Przykład:

> «Samotny górnik mieszkający wysoko w górach przy złożu złota.»

To nadal powinien być zwykły NPC z normalnym `CharacterDef`, rodziną/relacją „single", domem i rolą — nie osobny system postaci.

---

## 8. Food Source

Każda wioska powinna mieć przynajmniej jedno wiarygodne źródło żywności.

Nie oznacza to, że każda musi mieć pole.

Możliwe źródła:

| Źródło | Przykład |
|--------|----------|
| Pole | zboże |
| Ogród | warzywa |
| Sad | owoce |
| Hodowla | krowy, owce, kury |
| Rybołówstwo | jezioro, rzeka, morze |
| Zbieractwo | jagody, owoce leśne |
| Grzyby | las, bagno |
| Polowanie | dzikie zwierzęta |

Źródło żywności powinno zależeć przede wszystkim od lokalnego środowiska.

Przykład:

```
jezioro
→ ryby

żyzna ziemia
→ pola

las
→ owoce / jagody / grzyby / polowanie

łąka
→ hodowla / uprawy
```

---

## 9. Zasoby a nazwa wioski

Zasoby mogą wpływać na nazwę wioski.

Nazwa nie musi już wynikać wyłącznie z terenu.

Możliwa logika:

```
terrain + dominant resource + seed
```

Przykłady:

- Ironvale
- Goldbrook
- Saltshore
- Resinwood
- Mossmere

W przyszłości nazwy mogą być oczywiście dostosowane do stylu/lokalizacji świata.

Zasób nie powinien zawsze występować w nazwie — tylko gdy jest wystarczająco znaczący.

---

## 10. Resources → Crafting

Docelowy kierunek:

```
resources
    ↓
production
    ↓
crafting
    ↓
goods
```

Przykłady:

```
glina → garncarstwo → garnki

drewno → stolarstwo → deski / narzędzia

żelazo + węgiel → kowalstwo → narzędzia

wełna → przędzenie → tkaniny
```

Na tym etapie nie implementujemy jeszcze pełnego craftingu gracza.

Najpierw interesuje nas co potrafi produkować dana osada.

---

## 11. Village Economy

W przyszłości każda wioska może posiadać:

**Production** — co może produkować dzięki lokalnym zasobom.

**Consumption** — czego potrzebuje jej populacja.

**Surplus** — czego ma więcej, niż potrzebuje.

**Deficit** — czego jej brakuje.

Przykład:

```
Wioska Żelazna

produkuje:
- żelazo
- narzędzia

potrzebuje:
- żywności

eksportuje:
- narzędzia

importuje:
- zboże
```

Druga wioska:

```
Wioska nad Jeziorem

produkuje:
- ryby
- zboże

potrzebuje:
- narzędzi

eksportuje:
- żywność

importuje:
- żelazo / narzędzia
```

---

## 12. Barter / Trade

Dopiero z powyższych systemów może naturalnie powstać handel:

```
Resources
    ↓
Village Production
    ↓
Goods
    ↓
Village Needs
    ↓
Surplus / Deficit
    ↓
Barter / Trade
```

Nie tworzymy od razu systemu sklepów ani waluty.

Pierwszym modelem handlu może być barter:

```
10 ryb ↔ 1 żelazne narzędzie
```

Wartość może później wynikać z lokalnej dostępności i zapotrzebowania, zamiast być globalnie ustaloną ceną.

---

## 13. Zasada projektowa

Nie budować osobnych, niezależnych systemów:

- „ResourceSystem"
- „EconomySystem"
- „TradingSystem"
- „VillageProductionSystem"

jeżeli te systemy dublują dane.

Zamiast tego rozwijać istniejące zależności:

```
World
  ↓
Terrain
  ↓
Natural Resources
  ↓
Settlement
  ↓
Families / Roles
  ↓
Food & Production
  ↓
Goods
  ↓
Needs
  ↓
Surplus / Deficit
  ↓
Trade
```

Każdy kolejny etap powinien wykorzystywać dane wygenerowane wcześniej.

---

## 14. Zakres pierwszej implementacji

Pierwsza wersja powinna obejmować tylko:

1. ~~Generowanie naturalnych zasobów.~~ → `done`, `src/terrain/naturalResources.ts`
2. ~~Preferencje zasobów względem terenu.~~ → `done`
3. ~~„richness" zasobów.~~ → `done`
4. ~~Wpływ zasobów na atrakcyjność lokalizacji wioski.~~ → `done` (ranking w obrębie już wybranej komórki siatki osad, patrz „Świadome odstępstwa" wyżej)
5. ~~Food source dla każdej wioski.~~ → `done` (dane/flavor, bez nowej geometrii)
6. ~~Dedykowaną rodzinę + domek dla znaczącego zasobu.~~ → `done`
7. ~~Opcjonalne resource outposts.~~ → `done`
8. ~~Wpływ dominującego zasobu na nazwę wioski.~~ → `done`
9. ~~Przygotowanie danych pod przyszłe „production" / „goods".~~ → `done` (pokryte modelem `NaturalResource`)

Bez pełnego craftingu, inventory, ekonomii i handlu na tym etapie.

Te systemy powinny zostać zbudowane później na bazie danych wygenerowanych tutaj.

## Poza zakresem v1 (podsumowanie)

- Crafting (sekcja 10), pełna village economy production/consumption/surplus/deficit (sekcja 11), barter/trade (sekcja 12) — kolejne etapy po tym planie.
- **Inventory system gracza z limitem wagowym (weight capacity)** dla przedmiotów noszonych przez gracza — osobna, jeszcze niezaplanowana funkcja (patrz „Review" wyżej); dzisiejszy `src/items/Inventory.ts` liczy sztuki bez limitu. Nie część tego planu. Kierunek UI: zdjąć tekstowe liczniki przedmiotów z HUD, zastąpić dedykowanym ekranem Inventory w menu (jak `createVillagersScreen.ts`/`createQuestLog.ts`).
- Waluta / globalne ceny — świadomie odłożone na rzecz lokalnego bartera.
