# Plan: Firewood, Wood Piles and Scalable Fire

**Created:** 2026-09-03
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~items-player-009~~ ~~122~~
**Domain:** `items-player`
**Subdomains:** `items` `interaction`
**Tags:** `wood` `fire` `bonfire`

## Cel

Nadać losowo generowanym belkom drewna sensowną interakcję oraz rozszerzyć istniejący system ognia o stosy belek i skalowalne ognisko, bez tworzenia nowej mechaniki paliwa.

## Zakres

### Loose wood
- istniejące losowo spawnujące się belki powinny być interaktywne,
- gracz powinien móc je zebrać lub wykorzystać przez istniejący item/resource interaction flow,
- stan belki może uwzględniać prosty wariant jakości, np. usable/damaged/rotten, jeśli istniejący model itemów pozwala zrobić to bez nadmiernej rozbudowy.

### Wood piles
- wprowadzić prostą reprezentację stosu belek jako obiektu, który może być podpalony,
- stos ma własny stan zapalony/niezapalony i korzysta z istniejącego fire state/lifecycle,
- na tym etapie **tylko stosy belek** mogą być bezpośrednio podpalane.

### Scalable fire
Istniejąca mechanika pozostaje podstawą:

`branch → flame + intensity`

Dodać zależność wizualną rozmiaru ogniska od jego istniejącego stanu:
- `scale = 1` — obecne ognisko,
- wraz ze wzrostem fuel/intensity skala rośnie płynnie,
- maksymalnie `scale = 3` — bardzo duże ognisko/bonfire.

Nie dodawać nowych układów/modeli belek do wnętrza ogniska. Na tym etapie wystarcza skalowanie istniejącego modelu i odpowiednia skala płomienia zgodnie z istniejącą mechaniką intensity.

## Ograniczenia

- Reuse istniejącego fire/fuel system.
- Nie tworzyć drugiego systemu paliwa.
- Nie wprowadzać fire propagation.
- Nie pozwalać na podpalanie namiotów, budynków, drzew ani innych obiektów.
- Nie wymagać nowych modeli belek w ognisku.
- Nie zmieniać bez potrzeby istniejącej mechaniki dokładania gałęzi.

## Poza zakresem

- pożary świata,
- rozprzestrzenianie ognia,
- palenie dowolnych obiektów,
- zaawansowane stany zniszczenia drewna,
- fizyczna symulacja układania belek.

## Verification

- istniejące ognisko przy `scale = 1` wygląda jak obecnie,
- zwiększanie fuel/intensity zwiększa skalę ogniska bez skoków/teleportacji,
- maksymalny rozmiar wynosi `scale = 3`,
- flame/light pozostają spójne z intensity,
- loose wood ma działającą interakcję,
- wood pile można podpalić,
- ponowne podpalenie nie tworzy duplikatu ognia,
- inne obiekty nadal nie mogą być podpalane,
- save/load i WorldBundle rebuild zachowują wymagany stan zgodnie z istniejącym fire/item lifecycle.

Przy implementacji dodać JSDoc do ważnych publicznych funkcji/klas architektonicznych, gdy pomaga to w preflight discovery; dla nowych mechanizmów preferować `@domain`.

**Zrób git commit i push do main, rebase jeżeli trzeba**
