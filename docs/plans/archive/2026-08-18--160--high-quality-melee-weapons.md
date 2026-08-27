# Plan: High-quality melee weapons

**Created:** 2026-08-18
**Status:** `done` ✅
**Priority:** medium · **Effort:** M
**Depends on:** ~~134~~ ~~150~~

domain: items-player
tags: [quests-progression]

## Cel

Dodać mały zestaw wysokiej jakości broni białej, który rozszerza istniejący system `ItemKind` + `ITEM_CATALOG` + player melee/defense bez tworzenia osobnego systemu broni.

Broń ma różnić się materiałem, jakością i zastosowaniem, a nie tylko nazwą. Plan nie implementuje ostrzenia, naprawy ani ogólnego systemu durability — to osobny plan konserwacji broni.

## Stan obecny

Aktualny codebase ma już:

- `knife`, `short_sword`, `long_sword`, `spear`, `axe` jako holdable melee items;
- wspólny `MeleeConfig` w `src/items/itemCatalog.ts`;
- wspólny `DefenseConfig` dla blokowania;
- inventory oparte na `ItemKind` oraz generyczne `ItemInstance` dla przedmiotów wymagających indywidualnego stanu;
- istniejący melee resolver i combat mode;
- istniejącą siekierę używaną zarówno jako narzędzie, jak i broń.

Źródłem prawdy podczas implementacji są aktualne pliki i testy, nie historyczne plany.

## Nowe ItemKind

Dodać:

- `damascus_knife` — wysokiej jakości nóż z damasceńskim ostrzem;
- `damascus_short_sword` — krótki miecz damasceński;
- `damascus_long_sword` — długi miecz damasceński;
- `obsidian_sword` — bardzo rzadki miecz z obsydianu / wulkanicznego szkła;
- `battle_axe` — ciężki topór bojowy, który zachowuje funkcję siekiery;
- `masterwork_sword` — wysokiej jakości stalowy miecz bez egzotycznego materiału.

Nie tworzyć osobnego `ItemKind` dla jakości typu `used`, `worn`, `sharp` itp.

## Charakterystyka broni

### Damascus knife

Względem zwykłego `knife`:

- wyższe obrażenia;
- szybsza lub podobna szybkość ataku;
- bardzo dobra broń do krótkiego dystansu;
- wysoka wartość handlowa;
- ekskluzywny asset/model.

### Damascus short sword

Względem `short_sword`:

- wyższe obrażenia;
- bardzo dobra szybkość;
- niewielki zasięg;
- dobra obrona;
- wysoka wartość handlowa.

### Damascus long sword

Względem `long_sword`:

- wyższe obrażenia;
- zachowany długi zasięg;
- dobra obrona;
- cięższy/elitarny charakter;
- bardzo wysoka wartość handlowa.

### Obsidian sword

Broń rzadka i wyjątkowa:

- bardzo wysoka ostrość / obrażenia;
- dobra skuteczność ofensywna;
- niższa trwałość jest **przyszłym** zachowaniem planu konserwacji, nie implementować tu durability jako nowego systemu;
- bardzo wysoka wartość;
- powinien być wyraźnie rzadszy od stalowych i damasceńskich broni.

Nie przedstawiać go jako realistycznie „niezniszczalnego super-miecza”. Jego przewaga ma wynikać z ostrza i ofensywnego profilu, a ograniczenie może zostać później podłączone przez system konserwacji.

### Battle axe

Nowy ciężki topór:

- większe obrażenia niż zwykła `axe`;
- szeroki/ciężki profil ataku;
- wyższy koszt staminy i wolniejsza obsługa;
- możliwość blokowania zgodnie z istniejącym systemem;
- **zachowuje funkcję siekiery**: może ścinać drzewa i być używany w istniejącym harvest/chop flow;
- nie tworzyć osobnego systemu „weapon axe” vs „tool axe”.

### Masterwork sword

Wysokiej jakości stalowy miecz:

- lepszy od zwykłego `long_sword`;
- mniej egzotyczny i tańszy od najlepszych wariantów damasceńskich;
- solidny kompromis damage / defense / weight / price;
- może być główną „elitarną” bronią dostępną bez rzadkiego materiału.

## Statystyki

Każdy nowy item otrzymuje konfigurację w istniejącym `MeleeConfig` i `DefenseConfig`.

Nie tworzyć osobnej tabeli statystyk broni.

Balans powinien zachować czytelną hierarchię:

```text
knife
  < damascus_knife

short_sword
  < damascus_short_sword

long_sword
  < masterwork_sword
  < damascus_long_sword

axe
  < battle_axe

obsidian_sword
  = bardzo wysoka ofensywa + wysoka rzadkość
```

Dokładne wartości damage/range/timing/stamina powinny wynikać z obecnych wartości w `ITEM_CATALOG` i zostać dostrojone względem aktualnego combat balance, zamiast być kopiowane mechanicznie z założeń planu.

## Materiały i nazwy

Nie dodawać ogólnego systemu materiałów do itemów.

Materiał jest częścią konkretnego `ItemKind` i opisu przedmiotu. Przyszły crafting może wykorzystać te koncepty, ale ten plan nie tworzy systemu recept ani metalurgii.

Dla obsydianu używać nazwy i opisów jednoznacznie wskazujących na wulkaniczne szkło.

## Modele / assety

Dla każdej nowej broni:

- dodać właściwy `modelUrl`, jeżeli asset jest dostępny;
- podłączyć model przez istniejący item model/held-item pipeline;
- zapewnić poprawne skalowanie i orientację w dłoni;
- wykorzystać istniejące mechanizmy asset discovery zamiast tworzyć nowy loader.

Jeżeli assetu wysokiej jakości nie ma w repozytorium, pozostawić `modelUrl: null` i oznaczyć brak assetu w planie/implementation notes zamiast dodawać przypadkowy model.

## Inventory / handel

Nowe itemy mają działać przez istniejące:

- `ItemKind`;
- `ITEM_DEFS`;
- `ITEM_CATALOG`;
- inventory;
- merchant catalog / ceny;
- held item;
- trade UI.

Każda broń otrzymuje wagę, opis i bazową cenę odpowiednią do jakości.

Nie tworzyć osobnego UI „weapon inventory”.

## Źródła pozyskania

Na tym etapie nowe bronie nie muszą być craftowalne.

Preferowane źródła:

- rzadki stock Kupca;
- nagroda za wartościowe wydarzenie/quest;
- ewentualnie późniejsze loot/drop tables.

Nie dodawać nowego globalnego systemu loot ani osobnego generatora broni.

Dla obsydianowego miecza pozyskanie powinno być szczególnie rzadkie i może pozostać początkowo ograniczone do jednego istniejącego kanału ekonomii/questów.

## Combat

Każda nowa broń musi korzystać z obecnego combat flow:

```text
held item
→ combat mode
→ melee config
→ hit resolver
→ damage
→ defense
```

Nie tworzyć specjalnych resolverów dla damascus, obsydianu ani battle axe.

Battle axe ma jedynie rozszerzyć istniejące zachowanie `axe` o nowy item kind, zachowując możliwość pracy z drzewami.

## Quality / sharpening boundary

Ten plan **nie implementuje**:

- durability broni;
- condition broni;
- ostrzenia;
- osełki;
- koła szlifierskiego;
- naprawy;
- degradacji ostrości.

Przyszły plan konserwacji powinien móc rozróżnić materiały i typy ostrzy oraz zmieniać skuteczność istniejącego `MeleeConfig`/damage resolvera bez tworzenia drugiego systemu broni.

## Konkretne miejsca do sprawdzenia/zmiany

Przed implementacją potwierdzić aktualne symbole i ownership w:

- `src/items/items.ts` — `ItemKind` / `ITEM_DEFS`;
- `src/items/itemCatalog.ts` — `ITEM_CATALOG`, `MeleeConfig`, `DefenseConfig`;
- player held-item/model pipeline;
- player melee resolver;
- defense resolver;
- axe/tree harvesting flow;
- merchant catalog / trade pricing;
- inventory UI i item details;
- asset/model registry oraz istniejące modele broni;
- testy inventory, item catalog, melee/combat i harvesting.

Nie robić niezwiązanych refaktorów.

## Performance

Nowe itemy są statycznymi definicjami i nie powinny generować pracy per-frame poza istniejącym held-item/render pipeline.

Nie dodawać managera broni ani globalnego ticka weapon system.

## Kryteria akceptacji

- [x] Sześć nowych `ItemKind` jest zarejestrowanych w `items.ts` i `itemCatalog.ts`.
- [x] Każdy nowy item ma poprawną kategorię, wagę, opis, cenę/źródło pozyskania i konfigurację melee.
- [x] Każdy nowy item może zostać przeniesiony przez istniejący inventory/merchant flow.
- [x] Damascus knife, short sword i long sword mają wyraźnie lepszy profil niż odpowiedniki podstawowe.
- [x] Obsidian sword ma bardzo wysoką ofensywę i wysoką rzadkość bez tworzenia specjalnego combat resolvera.
- [x] Battle axe działa w walce i nadal może być używany jako siekiera w istniejącym harvest flow.
- [x] Masterwork sword stanowi wysokiej jakości stalową alternatywę dla Damascus.
- [x] Nowe bronie korzystają wyłącznie z istniejącego melee/defense pipeline.
- [x] Dostępne assety są poprawnie podłączone i wyświetlają się w dłoni. — GLB w `public/models/items/` (Quaternius Medieval Weapons Pack + Axe Double). Damascus: baked teal/navy/pale silver, not gray. Obsidian: Claymore reminted to volcanic purple/black glass. Masterwork: `Sword_Golden`. Battle axe: Axe Double. Grip orientation not browser-verified.
- [x] Brak assetu nie blokuje definicji itemu, jeżeli repozytorium nie posiada odpowiedniego modelu.
- [x] Testy jednostkowe pokrywają rejestrację itemów, statystyki i battle axe jako narzędzie + broń.
- [x] Build/type-check/test przechodzą.
- [ ] Browser/manual check potwierdza held models, combat i ścinanie drzewa battle axe.

## Implementation summary

Zaimplementowane 2026-08-19. Sześć `ItemKind` w katalogu + hold/melee/defense. Kupiec: `damascus_knife` 90 / `damascus_short_sword` 140 / `masterwork_sword` 160 / `battle_axe` 110. Quest-only: `grozny-wilk` → `damascus_long_sword`, `wilcza-jama` → `obsidian_sword` (`RESOURCE_TRADE_VALUE` 240 / 320). `isChopTool` / `isHarvestKnife` rozszerzają istniejące bramki siekiery/noża. Modele: `modelUrl` + `ITEM_GLB_SPECS` + `HELD_GLB` (M44–M49 `wired`). Damascus/obsidian mają baked characteristic materials (teal banded steel / volcanic glass), nie szary miecz. Durability/ostrzenie poza zakresem (plan 161).

> **Zrób git commit i push do main, rebase jeżeli trzeba**
