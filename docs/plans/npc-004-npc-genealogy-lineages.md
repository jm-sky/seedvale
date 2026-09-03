# Plan: Drzewo genealogiczne NPC (rody Sema/Chama/Jafeta) + kompas „N" na minimapie

**Status:** `planned`
**Type:** polish
**Created:** 2026-08-08
**Priority:** low · **Effort:** S
**Domain:** `npc`  
**Scope:** rozszerza [village-generation](./archive/2026-08-08--031--village-generation.md) (`families.ts`, `settlementGenerator.ts`) o nowy, dodatkowy wymiar fabularny. (Kompas „N” na minimapie — superseded przez [067](./archive/2026-08-11--067--minimap-heading-and-north.md).)

## Skąd to się wzięło

Propozycja użytkownika po teście wiosek: NPC-e mają pochodzić z drzewa genealogicznego zaczynającego się od Adama i Ewy, ale **najstarsze NPC-e obecne w grze to synowie Noego** — czyli genealogia od Adama do Noego jest tłem fabularnym (lore), nie symulowanym drzewem z konkretnymi postaciami. Od synów Noego (Sem, Cham, Jafet) w dół, ich potomstwo (czyli wszystkie generowane wioski/rodziny w grze) powinno być rozmieszczone po mapie zgodnie z **kierunkami świata**, tak jak tradycyjnie kojarzy się ich potomków (Tabela Narodów, Rdz 10): Jafet → północ, Sem → wschód, Cham → południe. (Kompas na minimapie był w pierwotnym szkicu „przy okazji”; zrobiony osobno w [067](./archive/2026-08-11--067--minimap-heading-and-north.md).)

To czysto fabularna/kosmetyczna warstwa — **nie** próba teologicznej precyzji, tylko world-building nawiązujący do znanego schematu.

## Koncepcja

**Ród (`Lineage`)** — nowa, dodatkowa etykieta osady (nie NPC-a z osobna — cała wioska = jeden ród, tak jak cała wioska ma jeden `terrain`/`size`), jeden z trzech: `'shem' | 'ham' | 'japheth'`.

**Przypisanie deterministyczne z kierunku, bez nowego seeda:** `settlementGenerator.ts` już zna `cell: SettlementCell { gx, gz }` dla każdej osady — kierunek od początku świata to `Math.atan2(cell.gz, cell.gx)`. Dzielimy okrąg na 3 sektory po 120°, każdy przypisany do jednego rodu wg tradycyjnego skojarzenia:

- **Jafet** — sektor „północny" (ok. -150°..-30°, czyli głównie ujemne `gz`)
- **Sem** — sektor „wschodni" (ok. -30°..90°, głównie dodatnie `gx`)
- **Cham** — sektor „południowy" (ok. 90°..210°, głównie dodatnie `gz`)

(Dokładne granice sektorów do dopracowania przy implementacji — powyższe to szkic, nie finalna specyfikacja).

**Home-osada (cell `0,0`) jest wyjątkiem — bez rodu.** To „miejsce, gdzie wylądowała Arka" fabularnie — punkt zerowy, zanim ród się rozproszył. Dzięki temu **żadna zmiana nie dotyka zarezerwowanych postaci** (Anna/Piotr/Kasia/Marek, `families.ts`'s `reservedHomeFamilies`) ani hardkodowanych imion w questach — home-osada zostaje dokładnie taka, jaka jest dziś.

## Zakres v1 (świadomie ograniczony — kosmetyka, nie nowy system)

1. `SettlementDef` (`settlementGenerator.ts`) += `lineage: Lineage | null` (`null` tylko dla home) — liczone raz przy `generateSettlementDef`, deterministycznie z `(gx, gz)`.
2. Wyświetlenie: ekran „Mieszkańcy" (`createVillagersScreen.ts`) pokazuje ród NPC-a (dziedziczony z jego osady) jako dodatkowy tag/etykietę — np. „Ród: Sem" obok roli/osobowości. Ewentualnie nazwa osady (`generateSettlementName`) mogłaby dostać rodowy prefiks/sufiks — do rozstrzygnięcia przy implementacji, nie blokujące.
3. **Nie zmienia** `nameCulture`/`generateNpcName` (osobna, już działająca oś — patrz `families.ts`), **nie zmienia** roli/cech/osobowości/needs — czysto deskryptywna etykieta, jak `FamilyRelation` już jest w tej samej warstwie.
4. ~~**Minimapa: kompas „N".**~~ — **superseded by [067](./archive/2026-08-11--067--minimap-heading-and-north.md)** (heading-up + N na ramce; nie statyczne N u góry). **Zrobione 2026-08-11**

## Poza zakresem v1

- Rzeczywiste, symulowane drzewo genealogiczne z konkretnymi przodkami (Adam/Ewa/Noe jako realne postacie w grze) — to zostaje lore/tłem, nie danymi.
- Wpływ rodu na gameplay (needs, dialog, questy, relacje) — czysto deskryptywne, jak `FamilyRelation`.
- Migracja rodów / zmiana przynależności w czasie.
- Precyzyjne, „poprawne teologicznie" mapowanie — to world-building, nie ma pretensji do dokładności.

## Szkic zmian (pliki)

```
src/settlement/settlementGenerator.ts  # SettlementDef += lineage: Lineage | null;
                                        #   nowa fn lineageForCell(cell) w families.ts lub tu
src/settlement/families.ts             # (ew.) Lineage type + lineageForCell(), jeśli tu ma sens bardziej niż w settlementGenerator.ts
src/ui/createVillagersScreen.ts        # + etykieta rodu przy NPC (dziedziczona z osady)
```

## Weryfikacja

- Kilka `?seed=` — osady w różnych kierunkach od (0,0) dostają różne rody, home-osada bez rodu, questy v1 bez regresji.
- Ekran „Mieszkańcy" pokazuje ród przy NPC-ach spoza home.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test`.

## Powiązane

- [village-generation](./archive/2026-08-08--031--village-generation.md) — `families.ts`, `settlementGenerator.ts`, wzorzec dodawania czysto deskryptywnych etykiet (`FamilyRelation`)
- [minimap-heading-and-north](./archive/2026-08-11--067--minimap-heading-and-north.md) — kompas N (były punkt 4)
