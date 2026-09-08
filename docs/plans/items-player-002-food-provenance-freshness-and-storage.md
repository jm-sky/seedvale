# Plan: Food provenance, freshness and storage

**Created:** 2026-08-31  
**Status:** `verification needed` 🔍  
**Type:** feature  
**Priority:** medium · **Effort:** M  
**Depends on:** ~~155~~ ~~159~~ ~~164~~ ~~184~~  
**Domain:** `items-player`
**Roadmap:** `physical-resource-storage-and-logistics`  

## Cel

Rozszerzyć istniejący system żywności tak, aby:
- przetworzone mięso zachowywało gatunek źródłowy,
- FoodBatch zachowywał dokładny czas pozyskania i historię decay potrzebną po zmianach storage,
- persistence nie powodował utraty wieku ani pochodzenia żywności,
- warunki przechowywania wpływały na tempo psucia,
- zwykła skrzynia spowalniała psucie względem ekwipunku,
- obróbka nie mogła służyć do „odświeżania” starego jedzenia,
- inventory mogło agregować wiele partii bez utraty informacji o freshness,
- nie powstawały osobne ItemKind dla każdego gatunku i procesu.

Poza zakresem: spiżarnie, piwnice, lodówki, temperatura/wilgotność, solenie, wędzenie, osobny parametr quality oraz osobne roasted_*_meat. Mechanizm storage ma pozostać generyczny, aby takie konteksty można było później dodać bez przebudowy FoodBatch.

## 1. Pochodzenie mięsa

Surowe mięso pozostaje gatunkowym ItemKind:
- deer_meat
- rabbit_meat
- boar_meat
- wolf_meat
- beef

Legacy/generic `raw_meat` pozostaje obsługiwane bez wymuszania gatunku źródłowego.

Pieczone mięso pozostaje jednym ItemKind: `roasted_meat`.

FoodBatch zachowuje:
`sourceSpecies?: AnimalKind`

Przykład:

```ts
{
  itemKind: 'roasted_meat',
  count: 3,
  sourceSpecies: 'deer',
  acquiredAtDays: 125.4
}
```

Wartość odżywcza pieczonego mięsa wynika z sourceSpecies, tak jak obecnie wynika z gatunku dla surowego mięsa. Nie tworzyć osobnych ItemKind tylko dla różnic wartości odżywczej lub ceny.

`sourceSpecies` jest provenance, nie bieżącą formą produktu. Każde przetworzenie i transfer musi je zachować. Brak wartości jest poprawnym stanem dla żywności, dla której gatunek nie ma zastosowania, oraz dla generic `raw_meat`.

## 2. FoodBatch jako wewnętrzna partia

FoodBatch jest partią, a nie pojedynczym slotem inventory.

Minimalny model zachowuje istniejące pola i rozszerza go o provenance oraz stan potrzebny do lazy decay przy zmianie storage:

```ts
type FoodBatch = {
  count: number
  acquiredAtDays: number
  sourceSpecies?: AnimalKind
  // stan lazy effective-age / ostatniego storage checkpointu
}
```

`acquiredAtDays` pozostaje historycznym momentem pozyskania/utworzenia bieżącej formy produktu. Nie może być nadpisywany podczas zwykłego transferu ani używany jako jedyny zegar po wprowadzeniu różnych storage modifiers, ponieważ partia może wielokrotnie zmieniać storage.

Nie zaokrąglać acquiredAtDays do godzin/dni tylko po to, aby umożliwić stackowanie.

Przykład polowania:

- 10:15 → deer × 5
- 12:20 → deer × 3

ma utworzyć dwa batche:

- Batch A → ×5 @ 10:15
- Batch B → ×3 @ 12:20

Dokładny czas pozostaje częścią provenance. Obecne scalanie timestampów w tolerancji i wyliczanie średniego `acquiredAtDays` jest niezgodne z docelowym modelem: batchy o różnych timestampach nie wolno scalać przez uśrednienie.

## 3. Stackowanie i invariants FoodBatch

Stack itemu i FoodBatch to różne poziomy.

Inventory może prezentować:
`Deer meat × 8`

mimo że wewnętrznie posiada:
- FoodBatch A → ×5
- FoodBatch B → ×3

Obowiązują następujące invariants:

1. **Conservation:** suma `count` batchy danego perishable ItemKind zawsze odpowiada jego fizycznej liczbie sztuk u danego właściciela.
2. **Lossless split:** podział batcha kopiuje wszystkie metadata lifecycle/provenance 1:1; zmienia się wyłącznie `count`.
3. **Lossless merge:** batche wolno scalać tylko wtedy, gdy wszystkie metadata wpływające na provenance i dalszy decay są identyczne. Nie uśredniać timestampów, effective age ani storage checkpointów.
4. **Presentation-only aggregation:** różne batche mogą tworzyć jeden widoczny stack/count UI bez fizycznego merge.
5. **FIFO:** konsumpcja, bait, cooking/drying input i transfer wymagający wyboru części stacka wybierają najstarszy efektywnie batch jako pierwszy. Dla równych effective ages tie-break ma być deterministyczny, np. wcześniejszy `acquiredAtDays`, potem stabilna kolejność batchy.
6. **Partial consumption:** częściowe zużycie zmniejsza `count` konkretnego najstarszego batcha; nie zmienia jego metadata.
7. **Transfer identity:** transfer pomiędzy właścicielami/storage przenosi dokładnie te same units i provenance. Może zmaterializować checkpoint decay z powodu zmiany storage, ale nie może tworzyć nowego wieku ani nowego provenance.
8. **Persistence identity:** save/load zachowuje metadata wystarczające do uzyskania tego samego effective age, stage i provenance przed i po reloadzie przy tym samym world time.
9. **No rejuvenation:** żadna operacja poza semantycznie zdefiniowanym processingiem nie może zwiększyć pozostałego udziału shelf-life. Sam processing także nie resetuje zużytej części świeżości — reguły niżej.

Nie tworzyć osobnego slotu UI dla każdej partii.

## 4. Freshness semantics i shelf-life matrix

Obecny model Fresh → Medium → Spoiled pozostaje źródłem prawdy. Freshness nie jest ręcznie zmniejszanym licznikiem i nie jest osobnym quality.

Docelowo stan wynika z:
- current world time (`elapsedDays`),
- batch lifecycle state/effective age,
- aktualnego storage decay modifier,
- `ITEM_CATALOG[kind].food.freshness`.

`Fresh` trwa `freshDurationDays` effective-age days. `Medium` trwa kolejne `mediumDurationDays`. Po ich sumie batch jest `Spoiled`.

Na tym etapie:
- Fresh / Medium → można użyć,
- Spoiled → nie można zjeść ani rozpocząć cooking/drying.

### 4.1 Docelowa macierz shelf-life

Utrzymać obecne wartości katalogowe dla aktualnie perishable foods; tworzą już czytelną hierarchię gameplayową. Wartości poniżej są w **effective game days przy decay 1.0×**:

| Food | Fresh | Medium | Spoiled od | Decyzja |
|---|---:|---:|---:|---|
| `fish` | 0.75 | 0.75 | 1.5 d | najszybciej psujący się surowiec; motywuje szybkie jedzenie/suszenie |
| `raw_meat`, `deer_meat`, `wolf_meat`, `boar_meat`, `rabbit_meat`, `beef` | 1 | 1 | 2 d | wspólna trwałość surowego mięsa niezależnie od gatunku |
| `berries` | 1 | 1 | 2 d | szybko psujący się naturalny food/bait |
| `mushroom` | 1.5 | 1.5 | 3 d | nieco trwalszy forage |
| `apple` | 2 | 2 | 4 d | średnio trwały owoc |
| `cabbage` | 2 | 2 | 4 d | średnio trwałe warzywo |
| `carrot` | 3 | 3 | 6 d | trwałe warzywo korzeniowe |
| `egg` | 3 | 3 | 6 d | obecna spójna wartość, bez osobnej mechaniki temperatury |
| `potato` | 4 | 4 | 8 d | najtrwalsze z bieżących świeżych warzyw |
| `nuts` | 5 | 5 | 10 d | trwały naturalny travel food |
| `roasted_meat`, `roasted_fish` | 1.5 | 1.5 | 3 d | gotowanie wydłuża życie względem raw, ale nie jest metodą długiej konserwacji |
| `dried_meat`, `dried_fish` | 20 | 20 | 40 d | właściwa konserwacja długoterminowa |

`honey` oraz foods bez `food.freshness` pozostają non-perishable i nie potrzebują FoodBatch decay bookkeeping tylko dlatego, że są jedzeniem.

`tomato`, `bread`, `cheese` są obecnie food/consumables bez freshness definition, więc ten plan nie nadaje im po cichu nowych shelf-life. Dodanie ich do decay wymaga świadomej osobnej decyzji balansowej/katalogowej, nie skutku ubocznego refaktoru FoodBatch.

## 5. Storage matrix i decay semantics

Wprowadzić generyczny storage/decay modifier. Storage wpływa wyłącznie na **tempo narastania effective age od momentu wejścia do danego kontekstu**; nie modyfikuje katalogowego shelf-life i nie zmienia `acquiredAtDays`.

### 5.1 Docelowa macierz storage

| Storage context | Decay | Semantyka |
|---|---:|---|
| Player carried inventory | 1.0× | baseline |
| NPC carried `Inventory` / food in transit | 1.0× | fizycznie niesione jedzenie, bez bonusu |
| Carried chest/container | 0.5× | contents pozostają wewnątrz tej samej skrzyni; podniesienie skrzyni nie odbiera jej właściwości storage |
| Placed chest/container | 0.5× | obecny podstawowy storage bonus |
| Household `items` storage | 0.5× | traktować jako zwykłe domowe przechowywanie, bez projektowania pantry/cellar |
| Settlement economy `items` food storage | 0.5× | abstrakcyjny magazyn osady ma te same podstawowe warunki co dom/chest, bez ukrytej lepszej technologii |
| Drying rack, in-progress raw input | 1.0× | processing nie zamraża spoilage; raw input starzeje się podczas suszenia |
| Dropped/world perishable food, jeśli batch jest przenoszony do world drop | 1.0× | brak ochrony storage |

Decyzja 0.5× dla wszystkich istniejących „stored, not carried loose” kontekstów upraszcza balans: skrzynia/dom/magazyn dają dokładnie 2× więcej czasu kalendarzowego, ale nie stają się namiastką przyszłej spiżarni/piwnicy. Przyszłe storage types mogą dostarczyć inny modifier bez zmiany shelf-life ani FoodBatch semantics.

### 5.2 Zmiana storage

Przy każdej zmianie decay context:

1. policzyć effective age narosły do `nowDays` przy starym modifierze,
2. zapisać checkpoint tej wartości i `nowDays`,
3. od tego momentu naliczać dalszy effective age przy nowym modifierze.

Nie tickować batchy per frame. Obliczenia pozostają lazy/event-based i korzystają z absolutnego world time.

Przykład: 1 dzień raw meat w inventory = 1 effective day. Następny 1 dzień w chest 0.5× = +0.5 effective day. Po 2 dniach kalendarzowych batch ma 1.5 effective day i jest Medium, a nie Spoiled.

Podniesienie całej skrzyni nie jest transferem contents do inventory gracza: carried chest zachowuje 0.5×. Dopiero wyjęcie food ze skrzyni zmienia jego context na 1.0×.

## 6. Processing rules

Processing tworzy nową **formę produktu**, ale nie może służyć do odświeżania starego surowca.

### 6.1 Wspólna reguła freshness inheritance

Przy zakończeniu procesu ustalić dla input batcha jego zużytą część całkowitego shelf-life:

`usedFraction = inputEffectiveAge / inputTotalShelfLife`, clamped do `[0, 1]`.

Output zaczyna własny shelf-life z tym samym `usedFraction`:

`outputEffectiveAge = usedFraction * outputTotalShelfLife`.

Dzięki temu:
- processing może realnie wydłużyć **absolutny** pozostały czas, gdy output ma dłuższy shelf-life,
- ale nie może poprawić relatywnej świeżości produktu,
- Medium raw daje Medium output,
- prawie zepsuty raw daje prawie zepsuty output,
- Spoiled nie można rozpocząć/przetworzyć.

Jeśli input stanie się Spoiled w trakcie procesu, proces nie daje jadalnego outputu. Cooking należy rewalidować na completion. Drying również musi uwzględniać decay raw input podczas całego `TimedProcess`; suszarka nie zamraża czasu.

Output lifecycle checkpoint powstaje w faktycznym `completedAtDays` procesu, nie w czasie collect/interact. Opóźnione odebranie wysuszonego produktu nie może sprawić, że stanie się „świeży dopiero przy odbiorze”. Po completion output dalej starzeje się w kontekście drying-rack output jako 1.0× do czasu odebrania.

### 6.2 Raw → roasted

- `raw_meat` / gatunkowe raw meat → `roasted_meat`.
- `fish` → `roasted_fish`.
- zachować `sourceSpecies` dla mięsa;
- generic `raw_meat` może pozostać z `sourceSpecies = undefined`;
- input wybierać FIFO per actual FoodBatch, także przy batch cooking capacity 2/4;
- output z różnych sourceSpecies lub różnych lifecycle metadata pozostaje w różnych FoodBatch, nawet jeśli UI pokazuje jeden `roasted_meat × N`;
- processing timestamp/checkpoint = moment completion;
- dziedziczyć `usedFraction` zgodnie z regułą wspólną;
- raw input musi być usable przy start i completion.

Przykład: deer meat ma 2 d total shelf-life, roasted meat 3 d. Raw z effective age 1 d ma zużyte 50%; po pieczeniu output zaczyna z effective age 1.5 d, czyli nadal na granicy Medium, z 1.5 d effective life do Spoiled.

### 6.3 Raw → dried

- gatunkowe/raw meat → `dried_meat`;
- `fish` → `dried_fish`;
- zachować `sourceSpecies` dla mięsa;
- input wybierać FIFO;
- existing drying durations pozostają: meat 1.5 game day, fish 1 game day;
- surowiec starzeje się 1.0× podczas procesu;
- output powstaje logicznie w `startedAtDays + durationDays`;
- dziedziczyć `usedFraction` z input condition w completion;
- jeśli raw osiągnie Spoiled przed/na completion, suszenie nie może go uratować do jadalnego dried output.

Konsekwencja balansowa jest celowa: bardzo stare raw meat nie zdąży się wysuszyć. Dla raw meat o 2 d total shelf-life proces 1.5 d wymusza rozpoczęcie suszenia odpowiednio wcześnie; dla fish 1.5 d total / 1 d drying podobnie. Drying jest planowaniem konserwacji, nie awaryjnym resetem licznika.

## 7. FIFO, transfer i consumption

FIFO oznacza **najmniejszy pozostały effective shelf-life / największy effective age ratio**, nie wyłącznie najstarsze historyczne `acquiredAtDays`, ponieważ różne partie mogły spędzić różny czas w chest/inventory. Jeśli dwa batche mają taki sam relative freshness, użyć deterministycznego tie-breaku opisanego w §3.

Reguła dotyczy:
- zwykłej konsumpcji,
- bait consumption,
- cooking input,
- drying input,
- claim/withdraw części stacka do transferu.

Transfer inventory ↔ chest, household ↔ NPC carry, household ↔ settlement itd. zachowuje batch metadata i quantity. Storage checkpoint jest materializowany dokładnie raz przy zmianie context. Nie rekonstruować batcha z samego `ItemKind + count` ani nie nadawać mu `nowDays` jako nowego acquisition time.

## 8. Persistence

Zweryfikować i rozszerzyć wszystkie miejsca, w których FoodBatch może istnieć:
- player inventory,
- placed containers,
- carried containers,
- household food storage,
- settlement food storage,
- in-flight drying process,
- dropped perishable food, jeśli world drop przenosi istniejący batch.

Po save → load należy zachować:
- count,
- sourceSpecies,
- `acquiredAtDays`,
- effective-age/storage checkpoint state,
- pozostałe lifecycle metadata FoodBatch.

Save/load nie może odświeżać żywności, zmieniać jej stage ani usuwać provenance.

Obecne counts/instances snapshots dla chest, household i settlement storage są niewystarczające dla perishable food; docelowy zapis musi zachować FoodBatch metadata obok fizycznych counts. To samo dotyczy TimedProcess: raw input nie może po wejściu na drying rack zostać zredukowany wyłącznie do `ItemKind + count`.

World `elapsedDays` pozostaje autorytatywnym zegarem. Nie przechowywać osobnego stale decrementowanego freshness timera.

## 9. Inventory UI

Nie tworzyć osobnych ItemKind ani slotów dla poszczególnych batchy.

Przykładowo:
`Pieczone mięso × 8`

może reprezentować wiele FoodBatch.

Gatunek może być pokazany w szczegółach itemu, jeśli obecny UI ma odpowiednie miejsce. Nie eksponować technicznych timestampów/checkpointów jako podstawowej informacji.

Jeżeli jeden widoczny stack obejmuje partie o różnych stages, UI powinno raportować stan partii, która zostanie zużyta jako następna (FIFO), zamiast uśredniać freshness i ukrywać najstarszą żywność.

## 10. Shop / wartość

Cena nie wymaga osobnych ItemKind.

System cen powinien móc korzystać z:
- itemKind,
- sourceSpecies,
- istniejących reguł ceny.

Na tym etapie nie wprowadzać dodatkowej kary ekonomicznej za Medium, jeśli obecny model cen tego nie wymaga.

## 11. Concrete timelines

W przykładach `E-age` oznacza effective age liczony według storage modifierów.

### A. Raw meat: inventory → chest → inventory → roast → save/load → consume

1. Day 10.00: player harvests `deer_meat`; `acquiredAtDays=10.00`, E-age=0, Fresh.
2. Day 10.50: po 0.5 d w inventory 1.0× → E-age=0.5, Fresh.
3. Transfer do chest: checkpoint 0.5; chest zaczyna 0.5×.
4. Day 11.50: 1 d w chest → +0.5 E-age; razem 1.0/2.0 = 50%, raw jest Medium.
5. Wyjęcie do inventory materializuje E-age=1.0 i przełącza na 1.0×.
6. Natychmiastowe cooking kończy się kilka sekund real-time później; input nadal ~50% used.
7. Powstaje `roasted_meat(sourceSpecies=deer)` z ~50% usedFraction: E-age≈1.5 z 3 d total; nadal Medium. Nie staje się Fresh.
8. Save/load tego samego world day zachowuje ten sam E-age/stage/sourceSpecies.
9. Po kolejnych 1.4 effective d w inventory batch nadal Medium; po dojściu do 3.0 total jest Spoiled i nie może zostać zjedzony.

### B. Chest rzeczywiście wydłuża czas, ale nie resetuje wieku

1. Day 20.00: `berries`, E-age=0; total shelf-life 2 d.
2. Day 20.50: 0.5 d inventory → E-age=0.5.
3. Day 20.50–22.50: 2 d chest 0.5× → +1.0 E-age.
4. Day 22.50: E-age=1.5 → Medium, mimo 2.5 d kalendarzowych od zebrania.
5. Wyjęcie z chest nie zmienia E-age; następne 0.5 d inventory doprowadza do E-age=2.0 → Spoiled.

### C. FIFO po różnych storage histories

1. Batch A `apple` zebrany Day 30.0 spędza większość czasu w chest.
2. Batch B zebrany Day 30.5 cały czas jest niesiony w inventory.
3. Day 32.0 B może mieć większy usedFraction mimo późniejszego `acquiredAtDays`.
4. Konsumpcja/processing wybiera B jako pierwszy, jeżeli ma mniej remaining shelf-life. Historyczny timestamp służy dopiero jako tie-break, nie zastępuje effective freshness.

### D. Drying nie ratuje starego mięsa

1. Day 40.00: świeże `boar_meat`, total 2 d.
2. Day 40.75: po 0.75 d inventory raw ma 37.5% used.
3. Rozpoczyna drying trwający 1.5 d; input starzeje się na racku 1.0×.
4. Raw przekroczyłby 2.0 E-age w Day 42.00, przed planowanym completion Day 42.25.
5. Proces nie może wygenerować jadalnego `dried_meat`; processing nie odwraca spoilage.

### E. Successful early drying + delayed collection

1. Day 50.00: świeże `fish`.
2. Natychmiast rozpoczęte drying trwa 1 d; completion Day 51.00. Raw ma wtedy 1.0/1.5 = 66.7% used i nadal Medium.
3. `dried_fish` powstaje logicznie Day 51.00 z 66.7% usedFraction, czyli E-age≈26.67 z 40 d total.
4. Player wraca dopiero Day 53.00. Dried output przez 2 d dalej starzał się 1.0× → E-age≈28.67; collect nie resetuje timestampu/checkpointu.
5. Save przed collect i load po nim daje identyczny wynik jak nieprzerwany świat.

### F. Transfer household → NPC carry → settlement

1. Household ma batch `carrot` w 0.5× storage.
2. Przy claim do NPC materializuje się household checkpoint; batch przechodzi na carry 1.0×.
3. W drodze E-age rośnie normalnie.
4. Deposit do settlement materializuje carry interval i przełącza batch na 0.5×.
5. Count, sourceSpecies (jeśli dotyczy), acquisition/provenance i E-age są zachowane; żadna faza transferu nie używa `nowDays` jako nowego acquisition time.
6. Save/load settlement storage zachowuje wynik dokładnie.

## 12. Weryfikacja implementacji

Po implementacji zweryfikować deterministycznymi testami co najmniej:
- dokładne timestamps/provenance pozostają rozdzielne,
- split/merge nie uśrednia lifecycle metadata,
- FIFO korzysta z effective remaining shelf-life,
- mixed-species raw → roasted zachowuje provenance,
- Medium input pozostaje relatywnie Medium po processing,
- spoiled input nie może być uratowany cooking/drying,
- drying uwzględnia starzenie raw podczas procesu i completion time niezależny od collect time,
- inventory → chest → inventory materializuje 1.0×/0.5× bez resetu i double-countingu,
- carried chest zachowuje chest modifier,
- household/NPC/settlement transfer zachowuje batch metadata,
- player/chest/household/settlement/drying save-load zachowuje lifecycle state,
- non-perishable food i zwykłe non-food/ItemInstance behaviour pozostają bez zmian.

Używać deterministycznych `nowDays`/`elapsedDays`. Browser verification wykonuje użytkownik.

## 13. Kryteria zakończenia

- roasted_meat zachowuje sourceSpecies,
- wartość odżywcza przetworzonego mięsa korzysta z gatunku źródłowego,
- FoodBatch zachowuje dokładny provenance timestamp i lossless decay state,
- wiele batchy może być agregowanych do jednego widocznego stacka bez lossy merge,
- najstarsze efektywnie partie są zużywane/przetwarzane pierwsze,
- wartości shelf-life pozostają zgodne z macierzą §4.1,
- carried/NPC/world loose food ma 1.0× decay,
- chest/household/settlement storage ma 0.5× decay,
- carried chest zachowuje 0.5×,
- transfer storage nie resetuje wieku,
- cooking/drying dziedziczą relative freshness zamiast resetować output do Fresh,
- drying input starzeje się podczas procesu, a output zaczyna życie w completion time, nie collect time,
- wszystkie istotne FoodBatch są poprawnie zapisywane i odtwarzane,
- spoiled food nie może zostać przetworzone w celu odzyskania przydatności,
- nie powstają osobne ItemKind dla gatunku × procesu,
- mechanizm nie zakłada pantry/cellar/temperature, ale pozwala później dodać nowe storage modifiers bez zmiany semantyki FoodBatch.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
