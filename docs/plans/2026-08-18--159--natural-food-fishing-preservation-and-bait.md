# Plan: Natural Food, Fishing, Preservation and Bait

**Created:** 2026-08-18  
**Status:** `planned` 📋  
**Priority:** medium · **Effort:** L  
**Depends on:** ~~155~~ ~~156~~ ~~106~~

domain: `items-player`
tags: [`fauna`, `settlements-npcs`]

## Cel

Rozbudować istniejące systemy o spójny ekosystem żywności: naturalną żywność, uprawy, pszczoły i miód, wędkarstwo, zanętę, świeżość i psucie, suszenie/konserwowanie oraz przynęty do istniejących pułapek. Dodać generyczne procesy czasowe, które działają w tle i nie blokują gracza.

Nie tworzyć osobnych systemów dla poszczególnych rodzajów żywności.

## 1. Żywność

### Naturalna

- Jagody
- Jabłka
- Grzyby
- Orzechy
- Miód

### Uprawy

- Marchew
- Ziemniaki
- Kapusta

### Pozyskiwana

- Ryby
- Mięso
- Jajka i kolejne istniejące/przyszłe źródła

Najpierw sprawdzić istniejące itemy i modele 3D. Brakujące modele dobrać lub pobrać tak, aby pasowały stylistycznie do Seedvale.

Żywność ma korzystać z istniejących `ItemKind`, `Inventory`, household/settlement storage, potrzeb oraz przepływu transportu NPC.

## 2. Świeżość żywności

Wprowadzić wspólny mechanizm:

`Fresh → Medium → Spoiled`

Dotyczy m.in. mięsa, ryb, mleka, jaj, jagód, jabłek, grzybów i warzyw. Każdy produkt definiuje własne tempo psucia.

Miód jest wyjątkiem — praktycznie się nie psuje.

Świeżość musi być częścią stanu symulacji/inventory i zachowywać się poprawnie po save/load.

Plan 155 jest istotny dla reprezentacji stanu itemów. Przed implementacją rozstrzygnąć, czy freshness wymaga `ItemInstance`, czy można zachować wydajne stackowanie produktów o identycznym stanie świeżości.

## 3. Gotowanie

Gotowanie tworzy osobne produkty, np.:

`Fresh Fish → Baked Fish`

Produkty gotowane/pieczone również mogą się psuć:

`Baked Fish → Medium → Spoiled`

## 4. Generyczne procesy czasowe

Wprowadzić wspólny mechanizm `TimedProcess`.

Proces:

- rozpoczyna się po interakcji,
- trwa określony czas świata,
- nie blokuje gracza,
- działa w tle,
- ma stan postępu,
- może być zapisany i odtworzony po reloadzie,
- kończy się poprawnie po time-skipie.

Minimalny stan:

- input items,
- `startedAt`,
- duration,
- `completedAt`,
- output.

UI może pokazywać pasek postępu i pozostały czas.

Mechanizm ma być generyczny i możliwy do wykorzystania później przez suszenie, wędzenie, gotowanie, fermentację i inne procesy produkcyjne.

## 5. Suszenie / konserwowanie

Potwierdzić istniejący `dried_meat` i wykorzystać go zamiast tworzyć duplikat.

Dodać `dried_fish`.

Dodać fizyczny obiekt **suszarni / suszarki**.

Przykładowe procesy:

`Fresh Meat → Drying Rack → Dried Meat`

`Fresh Fish → Drying Rack → Dried Fish`

Proces trwa np. 3–6 godzin czasu świata i używa `TimedProcess`.

Suszone produkty nadal korzystają z freshness, ale mają znacznie dłuższy czas psucia.

Nie tworzyć osobnego `DryingSystem`.

## 6. Pszczoły i miód

Dodać ule i pszczoły jako powiązany system świata.

- Ul produkuje miód.
- Bez pochodni próba zebrania miodu powoduje atak pszczół i niewielkie obrażenia.
- Pochodnia w ręce odstrasza pszczoły i mocno ogranicza lub eliminuje obrażenia.
- Pochodnią można również spalić ul.
- Spalony ul zostaje zniszczony, pszczoły znikają, produkcja miodu się kończy, a gracz otrzymuje jednorazowy miód.

Wykorzystać istniejące interakcje, zdrowie i system ognia zamiast tworzyć równoległe mechanizmy.

## 7. Wędkarstwo

Dodać:

- wędkę,
- odpowiednie miejsca połowu,
- rzucanie i animację,
- ryby jako normalne itemy.

Na tym etapie bez pełnej symulacji populacji i migracji ryb.

## 8. Zanęta na ryby

Zanęta jest osobnym mechanizmem od przynęty do pułapek.

Użycie zanęty w konkretnym miejscu połowu daje lokalny bonus aktywności ryb przez kilka dni i zwiększa szansę złowienia ryby. Kolejne użycie może odświeżać lub wzmacniać efekt.

### Efekt wizualny

- animacja rzucania zanęty,
- particles przy tafli,
- lokalny efekt w wodzie,
- subtelna zmiana koloru wody w obszarze działania,
- efekt utrzymuje się przez czas działania i następnie zanika.

Stan zanęcenia należy do symulacji świata, nie do `Object3D`.

## 9. Przynęta do pułapek

Rozszerzyć istniejący system pułapek, wykorzystując istniejące itemy żywności zamiast tworzyć osobne `MeatBait` / `PlantBait`.

### Mięsna

Dla mięsożerców, drapieżników i odpowiednich wszystkożerców. Przykłady: mięso, ryba.

### Roślinna

Dla roślinożerców i odpowiednich wszystkożerców. Przykłady: marchew, jagody, jabłko.

Właściwa przynęta zwiększa zainteresowanie pułapką; niewłaściwa nie daje bonusu. Przynęta jest zużywana.

## 10. NPC i storage

Nowa żywność korzysta z istniejącego przepływu:

`source → NPC gathers → carrying → Household storage → consumption`

Wykorzystać mechanizmy z planu 156. Nie tworzyć osobnego systemu logistyki żywności.

## 11. Player

Gracz korzysta z tych samych itemów i mechanizmów co NPC: zbieranie, inventory, jedzenie, przetwarzanie, przechowywanie i użycie jako przynęty.

## 12. Kolejność implementacji

### A — Audit

Sprawdzić aktualne `ItemKind`, food items, czy istnieje `dried_meat`, modele 3D, Inventory/ItemInstance z planu 155, food/needs, existing resource sources, traps, storage, persistence i interaction system.

### B — Food definitions

Dodać produkty oraz parametry: food value, freshness, cooking, preservation i bait category.

### C — TimedProcess

Najpierw generyczny mechanizm procesów czasowych.

### D — Freshness

Wspólny system świeżości i psucia.

### E — Natural food

Jagody, jabłka, grzyby, orzechy, marchew, ziemniaki, kapusta.

### F — Preservation

Suszarnia + suszone mięso + suszona ryba.

### G — Fishing

Wędka + miejsca połowu + ryby.

### H — Fishing bait

Zanęta + kilkudniowy lokalny bonus + efekty wizualne.

### I — Bees

Ule + pszczoły + miód + pochodnia + spalanie.

### J — Trap bait

Integracja istniejących food items z pułapkami.

### K — NPC integration

Sprawdzenie transportu, storage i konsumpcji nowych produktów.

## 13. Poza zakresem

Na razie nie implementować:

- pełnej ekologii populacji ryb,
- migracji ryb,
- zaawansowanej hodowli pszczół,
- uli hodowlanych,
- lodówek,
- fermentacji,
- rozbudowanego gotowania,
- chorób od zepsutego jedzenia,
- systemu cen żywności.

Architektura powinna pozwolić dodać je później.

## 14. Weryfikacja

Sprawdzić end-to-end:

- wszystkie nowe produkty można pozyskać,
- NPC może je transportować i przechowywać,
- gracz może je wykorzystać,
- freshness działa po czasie i po save/load,
- suszenie działa w tle i ma pasek postępu,
- timed process poprawnie działa po reloadzie i time-skipie,
- łowienie działa,
- zanęta daje lokalny bonus przez kilka dni,
- efekt wizualny zanęty pojawia się i znika,
- ul produkuje miód,
- pszczoły atakują, a pochodnia chroni,
- spalony ul przestaje produkować,
- pułapki rozpoznają właściwy typ przynęty,
- przynęta jest zużywana,
- streaming nie duplikuje ani nie gubi itemów.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
