# Plan: Books and Skill Learning

**Created:** 2026-09-04
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~world-012~~
**Domain:** `items-player`
**Subdomains:** `items` `inventory` `interaction`
**Tags:** `books` `skills` `knowledge` `trade` `treasure`

## Cel

Dodać książki jako fizyczzne przedmioty świata, które przekazują graczowi wiedzę i rozwijają istniejące umiejętności bez tworzenia równoległego systemu progresji.

Książki:
- można kupić,
- mogą być konkretnym elementem istniejącego `treasure`,
- można przechowywać, podnosić i upuszczać jak inne przedmioty,
- mają modele 3D,
- można przeczytać z inventory,
- rozwijają istniejący `PlayerSkills`,
- nie pozwalają osiągnąć pełnych 100% umiejętności.

Książki i mapy tworzą wspólną kategorię przedmiotów `knowledge`, ale efekt pozostaje własnością odpowiedniej domeny:

```text
knowledge item
   ├── map  ─────→ LocationKnowledge
   └── book ─────→ PlayerSkills
```

Nie tworzyć globalnego `KnowledgeManager`, osobnego `BookInventory` ani równoległego stanu progresji książkowej.

## Istniejąca architektura do zachowania

### PlayerSkills

Istniejące umiejętności gracza:
- `sneak`,
- `survival`,
- `traps`,
- `defense`,
- `archery`,
- `riding`.

XP pozostaje authoritative state, a skill value nadal wynika z istniejącej krzywej XP. Książki nie dodają `bookBonus`, `theoreticalSkill` ani osobnej krzywej book XP.

### Maps

`map_near` i `map_far` są istniejącym precedensem fizycznego przedmiotu przekazującego trwałą wiedzę. Mapy wpływają na `LocationKnowledge`; książki mają wpływać na `PlayerSkills`. Zmiana kategorii itemu nie może zmienić semantyki map ani persistence wiedzy o lokacjach.

## Kategoria `knowledge`

Rozszerzyć `ItemCategory` o `knowledge` i użyć jej dla książek oraz `map_near` / `map_far`. Zaktualizować kolejność kategorii i prezentację inventory zgodnie z istniejącym mechanizmem.

`knowledge` jest kategorią itemów, nie nową domeną gameplay.

## Model progresji przez książki

V1 ma trzy poziomy książek:

| Tier | Minimalny skill | Docelowy skill |
|---|---:|---:|
| podstawowy | 20% | 40% |
| średni | 40% | 60% |
| zaawansowany | 60% | 80% |

Książka reprezentuje wiedzę potrzebną do osiągnięcia konkretnego poziomu, a nie stałą porcję XP.

Przykłady:

```text
riding 23% + książka podstawowa       → 40%
riding 37% + książka średnia          → zbyt niski poziom
riding 46% + książka średnia          → 60%
riding 68% + książka zaawansowana     → 80%
riding 84% + dowolna książka riding   → brak wzrostu
```

Wymagany jest poziom umiejętności, a nie przeczytanie poprzedniej książki. Gracz może osiągnąć wymagane 40% lub 60% przez normalną praktykę i od razu przeczytać odpowiednią książkę.

Nie tworzyć `readBooks`, `unlockedBooks` ani zależności book I → book II → book III.

Książka może podnieść skill tylko wtedy, gdy jej target jest wyższy od obecnego poziomu. Wielkość przyrostu zależy od różnicy między aktualnym poziomem a targetem — znalezienie książki wcześniej może być bardziej wartościowe niż przeczytanie jej tuż przed targetem.

## Centralna operacja PlayerSkills

Dodać do domeny `PlayerSkills` operację pozwalającą zwiększyć skill do określonego poziomu bez jego obniżania. Dokładną nazwę dopasować do obecnego API; semantycznie:

```text
raiseSkillToValue(skill, targetValue)
```

Operacja:
1. odczytuje aktualny skill,
2. jeżeli `current >= target`, nic nie robi,
3. wykorzystuje istniejące przeliczenie target skill value → XP,
4. zwiększa XP do wartości odpowiadającej targetowi,
5. nigdy nie zmniejsza XP.

Book interaction nie może bezpośrednio mutować wewnętrznego stanu XP.

## Książki V1

Dodać 18 książek: 6 umiejętności × 3 poziomy.

### Riding

| Tier | Tytuł | Requirement | Target | Cena |
|---|---|---:|---:|---:|
| I | Pierwsze kroki w siodle | 20% | 40% | 30 |
| II | Pewna ręka, spokojny koń | 40% | 60% | 60 |
| III | Sztuka doskonałego jeźdźca | 60% | 80% | 120 |

### Archery

| Tier | Tytuł | Requirement | Target | Cena |
|---|---|---:|---:|---:|
| I | Łuk i strzała — pierwsze lekcje | 20% | 40% | 25 |
| II | O pewnym oku i celnej strzale | 40% | 60% | 55 |
| III | O łuku, wietrze i doskonałym strzale | 60% | 80% | 110 |

### Survival

| Tier | Tytuł | Requirement | Target | Cena |
|---|---|---:|---:|---:|
| I | Jak przetrwać z dala od domu | 20% | 40% | 20 |
| II | Las, góry i mokradła — poradnik wędrowca | 40% | 60% | 50 |
| III | Wiedza dzikich ostępów | 60% | 80% | 100 |

### Traps

| Tier | Tytuł | Requirement | Target | Cena |
|---|---|---:|---:|---:|
| I | Sidła i proste pułapki | 20% | 40% | 20 |
| II | Ślad, przynęta, pułapka | 40% | 60% | 50 |
| III | Kunszt starego trapera | 60% | 80% | 100 |

### Sneak

| Tier | Tytuł | Requirement | Target | Cena |
|---|---|---:|---:|---:|
| I | Jak stąpać cicho | 20% | 40% | 20 |
| II | Tam, gdzie nie sięga wzrok | 40% | 60% | 50 |
| III | Bez śladu i bez dźwięku | 60% | 80% | 100 |

### Defense

| Tier | Tytuł | Requirement | Target | Cena |
|---|---|---:|---:|---:|
| I | Nie daj się trafić! | 20% | 40% | 25 |
| II | Garda, unik i riposta | 40% | 60% | 55 |
| III | O sztuce przetrwania w pojedynku | 60% | 80% | 110 |

Ceny są celowo zróżnicowane. Jeździectwo jest najdroższe; survival, traps i sneak mają tańsze książki podstawowe.

## Item definitions i book metadata

Każda książka jest normalnym `ItemKind`. Nazwy techniczne powinny być stabilne i niezależne od wyświetlanego tytułu, np.:

```text
book_riding_basic
book_riding_intermediate
book_riding_advanced
```

Book-specific metadata ma być deklaratywne i mieć jedno źródło prawdy dla inventory, merchant UI i gameplay. Konceptualnie:

```text
skill: riding
requiredSkillValue: 0.40
targetSkillValue: 0.60
```

Nie rozrzucać switchy po UI i gameplay code. Przed implementacją ustalić najlepsze miejsce metadata na podstawie aktualnego `ItemDef` / `ItemCatalogEntry` i istniejących capability/interaction patterns.

Descriptions mogą dodawać książkom charakteru, ale wartości mechaniczne (`skill`, requirement, target) muszą pochodzić z metadata, nie z ręcznie parsowanego tekstu.

## Czytanie i inventory interaction

Książka pozostaje fizycznym, niezużywalnym przedmiotem. Inventory udostępnia akcję:

```text
[Czytaj]
```

Czytanie w V1 jest natychmiastowe: bez timera, reading mode, animacji, blokowania ruchu i specjalnego ekranu otwartej książki.

Po wybraniu `Czytaj`:
1. pobrać deklaratywne book metadata,
2. odczytać aktualny skill,
3. sprawdzić requirement,
4. sprawdzić, czy target jest wyższy od aktualnego poziomu,
5. wywołać publiczną operację `PlayerSkills`,
6. pokazać rezultat przez istniejący feedback/notification pipeline.

Czytanie nie powinno zamykać inventory.

### Stany UX książki

Inventory powinno umożliwiać rozpoznanie co najmniej trzech stanów bez próbnego czytania:

- `Możesz się nauczyć` — requirement spełniony i skill < target,
- `Zbyt trudna` — skill < requirement,
- `Znana wiedza` — skill >= target.

Nie tworzyć osobnego persisted read-state; stan wynika z aktualnego `PlayerSkills`.

### Item details

W szczegółach książki pokazać co najmniej:

```text
O pewnym oku i celnej strzale

Łucznictwo
Poziom: średniozaawansowany

Wymagane: 40%
Twój poziom: 47%
Nauka do: 60%

[Czytaj]
```

Mechaniczna poprawność nie może zależeć wyłącznie od disabled button w UI — domena/interakcja zawsze waliduje requirement.

### Feedback

Przy sukcesie, np.:

```text
Przeczytano „O pewnym oku i celnej strzale”
Łucznictwo 47% → 60%
```

Przy zbyt niskim poziomie:

```text
Ta książka jest dla ciebie zbyt zaawansowana.
Wymagane: Łucznictwo 40%
Obecnie: 34%
```

Gdy target jest już osiągnięty:

```text
Nie dowiadujesz się z tej książki niczego nowego.
Łucznictwo: 67%
```

Wykorzystać istniejący feedback/toast mechanism; nie tworzyć `BookToast`.

## Sortowanie i prezentacja Wiedzy

Kategoria inventory `Wiedza` zawiera mapy i książki. Przy 18 książkach zapewnić stabilny, deterministyczny porządek zgodny z możliwościami obecnego inventory — preferować istniejące sortowanie lub prostą kolejność po tytule/skill-tier zamiast nowego subsystemu filtrowania.

Nie dodawać w V1 wyszukiwarki, filtrów po skillu ani osobnego book browsera.

## Praktyka i książki

Książki nie zastępują istniejącego zdobywania XP:

```text
praktyka ─────────────────────→ 100%
       ↗
książki → maksymalny target 80%
```

Nie wprowadzać hard capa 80% do `PlayerSkills`. 80% jest wyłącznie najwyższym `targetSkillValue` książek V1. Normalna praktyka może rozwijać skill powyżej 80%.

## Handel

Rozszerzyć istniejący trade catalog / merchant prices zamiast tworzyć book pricing system. Książki korzystają z normalnych `merchantPrice`, `tradeValue` i `sellPrice` zgodnie z aktualną architekturą.

Merchant UI powinien prezentować przed zakupem te same book metadata co inventory: skill, requirement i target. Gracz może kupić książkę, której jeszcze nie potrafi przeczytać — nie blokować zakupu na podstawie `requiredSkillValue`.

Nie dodawać confirmation dialogu przy sprzedaży ani specjalnych zasad sell-back tylko dla książek.

Nie tworzyć osobnego book merchant ani proceduralnego/random merchant stock w tym planie. Wpiąć książki w istniejący merchant flow w najmniejszy sposób zgodny z aktualnym systemem.

## Treasure i źródła książek

W V1 książki mogą trafić do gracza wyłącznie przez:

1. zakup,
2. istniejący system `treasure`.

Treasure powinien wskazywać konkretny `ItemKind` książki zgodnie z możliwościami aktualnego reward/treasure pipeline. Przykładowo:

```text
treasure
  ├── coins
  ├── valuable item
  └── book_archery_advanced
```

Znalezienie zaawansowanej książki może być wartościową nagrodą nawet wtedy, gdy gracz nie spełnia jeszcze wymagań do jej przeczytania.

Nie dodawać książek do:
- proceduralnego world spawnu,
- zwykłych losowych kontenerów,
- losowych loot tables,
- domów/budynków NPC,
- profession-specific loot,
- losowego merchant stock.

Nie tworzyć `BookLootTable`, `BookSpawner` ani `BookTreasureSystem`. Rozszerzyć istniejący treasure/reward mechanism.

## World item interaction

Jeżeli książka znajduje się fizycznie w świecie jako element treasure lub została upuszczona przez gracza, korzysta z istniejącego world-item interaction flow.

Preferowana interakcja:

```text
O łuku, wietrze i doskonałym strzale
[E] Podnieś
```

Nie dodawać czytania bezpośrednio z ziemi. Jedyna ścieżka czytania V1 to:

```text
world → pickup → inventory → Czytaj
```

## Modele 3D

Dostępnych jest 7 modeli książek Quaternius, obejmujących warianty otwarte i zamknięte. 18 logicznych książek ma współdzielić te assety — nie wymaga 18 osobnych GLB.

Zamknięty model jest podstawową reprezentacją książki jako world item/drop. Nie wiązać jednoznacznie modelu/koloru z tierem, aby wygląd nie kodował automatycznie poziomu książki.

Otwarte warianty mogą później służyć jako world props lub element przyszłej prezentacji czytania. V1 nie wymaga reading animation ani specjalnego open-book renderer.

Przed implementacją sprawdzić aktualny item model loading/rendering pipeline i rozszerzyć istniejący catalog. Nie tworzyć `BookRenderer`; współdzielone modele powinny korzystać z istniejącego cache/loading lifecycle.

## Persistence

Nie dodawać osobnego persistent book-learning state. Trwałym skutkiem czytania jest zwiększenie istniejącego XP `PlayerSkills`; książka pozostaje w inventory.

Save/load musi zachować:
- książkę w inventory,
- wynikający z przeczytania skill XP.

Nie zapisywać redundantnie `hasReadBook`.

## Debug API

Udostępnić przez istniejący Seedvale debug surface operacje pozwalające testować progresję skilli. Przed implementacją zrobić focused recon aktualnego debug API i zachować jego konwencję.

Potrzebne operacje semantycznie:

```text
getSkills()
setSkillValue(skill, value)
addSkillXp(skill, xp)
```

Opcjonalnie udostępnić `raiseSkillToValue`, jeżeli pasuje do istniejącego API.

Debug API ma korzystać z publicznych operacji `PlayerSkills`, bez bezpośredniej mutacji wewnętrznego XP. Powinno pozwalać łatwo ustawić np. `riding = 0.39` do testu blokady książki wymagającej 40%.

## Architektura

Preferowany przepływ:

```text
ItemKind
   ↓
book metadata
   ├── skill
   ├── requiredSkillValue
   └── targetSkillValue
            ↓
      book interaction
            ↓
       PlayerSkills
            ↓
            XP
```

Item system opisuje książkę. Interaction interpretuje jej użycie. `PlayerSkills` pozostaje właścicielem progresji.

Nie tworzyć:
- `BookManager`,
- `BookSystem`,
- `BookInventory`,
- `KnowledgeManager`,
- `BookSkillBonus`,
- `ReadBookStore`,
- osobnej krzywej book XP.

## Recon przed implementacją

Przed kodowaniem zrobić krótki focused recon:
1. aktualnego inventory action/UI i item-details pipeline,
2. sposobu deklarowania use/interactions dla `ItemKind`,
3. merchant UI i prezentacji item details przed zakupem,
4. world-item/model rendering i asset reuse,
5. aktualnego Seedvale debug API,
6. persistence `PlayerSkills`,
7. istniejącego treasure/reward pipeline,
8. dokładnych ścieżek 7 modeli Quaternius.

Wykorzystać istniejące mechanizmy zamiast book-specific parallel systems. Jeżeli `docs/CODE_INDEX.md` nadal opisuje inną liczbę skilli niż aktualny kod, poprawić rozbieżność dokumentacji.

## Testy

### Skill progression

- basic: 23% → 40%,
- basic przy 40% lub wyżej → brak zmiany,
- intermediate przy 39% → blocked,
- intermediate przy 40% → 60%,
- intermediate przy 51% → 60%,
- advanced przy 59% → blocked,
- advanced przy 60% → 80%,
- advanced przy 73% → 80%,
- advanced przy 84% → brak zmiany.

### Invariants

- książka nigdy nie zmniejsza XP ani skill value,
- wielokrotne czytanie nie farmi XP,
- praktyka może przekroczyć 80%,
- praktyka może spełnić requirement kolejnego tieru bez czytania poprzedniego,
- XP pozostaje authoritative state.

### Items / trade / treasure

- wszystkie książki mają kompletne i poprawne metadata,
- ceny korzystają z istniejącego trade catalog,
- buy/sell korzystają z istniejących reguł,
- merchant details pokazują zgodne requirement/target,
- konkretny `ItemKind` książki może być elementem istniejącego treasure,
- książka nie pojawia się przez nowy random spawn/loot mechanism,
- książkę z treasure/drop można podnieść przez istniejący world-item flow.

### Persistence

- książka pozostaje w inventory po save/load,
- skill zdobyty przez książkę pozostaje po save/load,
- nie jest wymagany dodatkowy read-book state.

### Maps regression

Po zmianie kategorii sprawdzić `map_near`, `map_far`, zakup map, `LocationKnowledge` i persistence wiedzy o lokacjach.

## Manual verification

W przeglądarce sprawdzić:
1. kupno podstawowej książki,
2. prezentację jej metadata w merchant UI i inventory,
3. poprawny stan `Możesz się nauczyć`, `Zbyt trudna` lub `Znana wiedza`,
4. przeczytanie książki i wzrost np. 23% → 40%,
5. pozostanie inventory otwartego i książki w inventory,
6. ponowne czytanie bez dodatkowego wzrostu,
7. intermediate przy 39% → odmowa,
8. intermediate po osiągnięciu ≥40% → 60%,
9. advanced przy <60% → odmowa,
10. advanced przy ≥60% → 80%,
11. dalszą praktykę → >80%,
12. pozyskanie konkretnej książki z treasure,
13. drop/pickup książki i poprawny model 3D,
14. save/load książki i zdobytego XP,
15. brak regresji `map_near` / `map_far`,
16. debug API dla skilli.

## Poza zakresem

- losowy/proceduralny spawn książek,
- książki w zwykłych random loot tables i kontenerach,
- czytanie książek przez NPC,
- literacy skill,
- czas potrzebny na czytanie,
- animacja/read mode,
- autorzy i unikalne egzemplarze,
- jakość/stany książek,
- biblioteki,
- pisanie książek,
- questy książkowe,
- kolekcjonowanie tomów,
- proceduralne generowanie tytułów,
- merchant rarity/random stock system,
- pasywne bonusy za samo posiadanie książki.

Architektura nie powinna blokować późniejszego wykorzystania książek przez NPC, questy lub bardziej kontekstowe źródła wiedzy.

## Definition of Done

Plan jest wykonany, gdy:
- istnieje kategoria `knowledge`,
- mapy należą do niej bez regresji,
- istnieje 18 książek z trzema tierami 20→40, 40→60 i 60→80,
- każda książka ma jedno źródło metadata dla skill/requirement/target,
- książki korzystają z istniejącego XP `PlayerSkills`,
- nie istnieje równoległy book progression state,
- książkę można przeczytać z inventory i czytanie nie zużywa itemu,
- UX pokazuje użyteczność książki oraz wynik czytania,
- ponowne czytanie nie daje dodatkowej progresji,
- książki można kupować i sprzedawać przez istniejący trade flow,
- konkretną książkę można umieścić jako element istniejącego treasure,
- żaden nowy mechanizm nie generuje książek losowo,
- world item/drop korzysta z istniejącego pickup flow,
- modele Quaternius są współdzielone między tytułami,
- praktyka może rozwijać skill powyżej 80%,
- debug API umożliwia kontrolowane testowanie skilli,
- save/load zachowuje rezultat,
- testy przechodzą,
- manual browser verification potwierdza gameplay.

Przy implementacji dodać JSDoc do ważnych publicznych funkcji/klas architektonicznych, gdy pomaga to w preflight discovery; dla nowych mechanizmów preferować `@domain`.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
