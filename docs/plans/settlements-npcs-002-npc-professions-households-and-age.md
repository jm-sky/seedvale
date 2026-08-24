# Plan: NPC Professions, Households & Age Activity

**Created:** 2026-08-24
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** ~~178~~ ~~069~~ ~~184~~ ~~185~~
**Domain:** `settlements-npcs`
**Tags:** [economy, items-player, npc, households]

## 1. Cel

Wprowadzić spójny model profesji NPC, ich związku z gospodarstwem domowym, wieku oraz generowania obsady profesji w osadach.

Plan zakłada, że plan **178 — Hunter Profession & Household** został wcześniej zrealizowany i jego model profesji/gospodarstwa jest punktem odniesienia dla pozostałych zawodów.

Ten dokument jest **wstępną wersją planu**. Przed implementacją należy wykonać codebase reconnaissance i zaktualizować zakres na podstawie rzeczywistego kodu.

Nie tworzyć równoległego systemu AI profesji. Profesja ma rozszerzać istniejące NPC `Schedule` / decision / strategy / action / household / economy mechanisms.

## 2. Profesja jako główny wkład NPC

Profesja określa główny zawodowy wkład NPC i gospodarstwa w życie osady, ale nie jest listą jedynych dozwolonych aktywności.

NPC nadal:

- je,
- pije,
- odpoczywa,
- wykonuje potrzeby osobiste,
- utrzymuje relacje,
- pomaga innym,
- korzysta z social places,
- wykonuje zwykłe aktywności wolnoczasowe.

Profesja powinna być jednym z wejść do istniejącego procesu:

```text
state + needs + problems + pressures
+ age + traits + personality + profession
+ household + relationships
        ↓
     decision
        ↓
     strategy
        ↓
      action
        ↓
 world / household / economy changes
```

Nie tworzyć osobnego `ProfessionAI`, `ProfessionScheduler` ani równoległego systemu zachowań.

## 3. Profesje v1

### Farmer

Główna działalność gospodarstwa:

- uprawa pól i ogrodów,
- sadzenie,
- podlewanie,
- pielęgnacja upraw,
- zbieranie plonów,
- opieka nad zwierzętami gospodarstwa.

Farmer i jego żona wspólnie zajmują się rolnictwem i zwierzętami. `Herder` nie jest osobną profesją.

### Woodcutter

Główna działalność:

- ścinanie drzew,
- pozyskiwanie drewna.

### Fisher

Główna działalność:

- łowienie ryb.

### Trader

Główna działalność:

- prowadzenie handlu w osadzie,
- przebywanie głównie w miejscu handlu / centrum osady,
- pomaganie innym NPC, gdy nie ma klientów.

Trader może poza pracą wykonywać zwykłe aktywności, np. łowić ryby lub korzystać z social places.

### Guard

Główna działalność:

- patrolowanie osady,
- reagowanie na zagrożenia,
- walka i obrona,
- pomaganie innym NPC.

Dodatkowo Guard:

- zapala ogniska,
- zapala pochodnie,
- przygotowuje nocne oświetlenie,
- nocą patroluje z pochodnią,
- w dzień powinien przede wszystkim odpoczywać i prowadzić życie prywatne.

Mechanizm lokalnego `HelpCall` / wezwania o pomoc zostaje **poza zakresem tego planu** i będzie osobnym planem.

### Miner

Główna działalność:

- kopanie / wydobywanie surowców ze złóż.

W przyszłości może również pomagać przy:

- kopaniu studni,
- pracach ziemnych,
- równaniu terenu.

### Blacksmith

Główna działalność:

- ostrzenie mieczy / broni,
- wytwarzanie metalowych przedmiotów,
- sprzedaż metalowych przedmiotów,
- skup rud i węgla.

Gospodarstwo Blacksmitha potrzebuje również drewna i wody. Zasoby mogą być zapewniane przez rodzinę albo pozyskiwane od innych mieszkańców, np. Woodcuttera, przez istniejący system zasobów.

### Healer / Herbalist

Zakres zostaje odłożony do osobnego planu obejmującego m.in.:

- zioła,
- zbieranie ziół,
- jagody leśne,
- grzyby i podobne naturalne zasoby,
- opatrunki,
- proste lekarstwa / leczenie.

Nie implementować tych nowych mechanizmów w tym planie.

### Hunter

Zakres jest określony przez plan **178 — Hunter Profession & Household**.

Zakładamy, że Hunter jest już zrealizowany przed rozpoczęciem tego planu. Nie projektować ponownie Huntera ani nie tworzyć drugiego modelu gospodarstwa myśliwego.

## 4. Gospodarstwo a profesja

Profesja jest przede wszystkim właściwością zawodową członka/gospodarstwa, ale praca może być wykonywana wspólnie przez rodzinę.

Przykład:

```text
Farmer household
├── Farmer
├── spouse
└── children
        ↓
 wspólna praca gospodarstwa
```

Rodzina może wspólnie zabezpieczać zasoby potrzebne do głównej działalności gospodarstwa.

Profesja nie oznacza, że właściciel profesji musi osobiście wykonać każdą czynność związaną z produkcją.

## 5. Wiek a intensywność profesji

Wiek ogranicza zakres i intensywność pracy, ale nie musi usuwać profesji z NPC.

### Małe dzieci

- nie pracują,
- głównie bawią się,
- biegają i chodzą po osadzie,
- obserwują świat.

**Udział w pracy: 0%.**

### Duże dzieci

- nadal dużo się bawią,
- pomagają rodzicom,
- uczą się profesji poprzez rzeczywistą pomoc,
- mogą pomagać około **1/4–1/2 czasu pracy rodzica**.

Pomoc powinna być ograniczona możliwościami wieku i istniejącymi czynnościami profesji.

### Dorośli

- normalnie wykonują profesję,
- pełny udział w pracy.

**Udział: ~100%.**

### Starzy

- nadal mogą wykonywać swoją profesję prawie normalnie,
- pracują mniej lub z większą liczbą przerw,
- częściej odpoczywają,
- częściej spacerują,
- częściej łowią ryby.

**Udział orientacyjny: ~80–100%.**

### Bardzo starzy

- znacznie mniej pracy,
- głównie spokojne aktywności i chodzenie,
- łowienie ryb,
- okazjonalna lekka pomoc.

## 6. Dziedziczenie profesji

Dziecko może przejąć profesję rodzica.

Przykład:

```text
Ojciec → Blacksmith
Matka  → Farmer

Dziecko → wybrana profesja rodzinna
```

Dokładne zasady wyboru profesji przy rodzicach o różnych profesjach należy ustalić po analizie obecnego genealogy / household / settlement generation code.

Nie wprowadzać nowego niezależnego systemu dziedziczenia profesji, jeżeli istniejący model rodziny może zostać rozszerzony.

## 7. Profesja a wolny czas

Profesja nie blokuje zwykłego życia NPC.

NPC różnych profesji mogą korzystać z planowanych `social places`.

W wolnym czasie mogą wykonywać inne aktywności, np.:

- spotkania społeczne,
- spacery,
- odpoczynek,
- łowienie ryb.

Łowienie ryb może więc wystąpić również u NPC, dla którego Fisher nie jest profesją.

## 8. Przedmioty i narzędzia profesji

Plan ma objąć również brakujące przedmioty potrzebne do realizacji profesji.

Przykład v1:

### Kosa

Dodać **kosę** jako normalny item z wykorzystaniem istniejącego modelu capability/catalog.

Kosa powinna być jednocześnie:

- **tool** — narzędzie pracy rolnika,
- **weapon** — posiadać istniejącą konfigurację melee, aby mogła być używana jako broń.

Nie tworzyć osobnego `FarmTool` ani `ScytheSystem`.

Dokładne capability kosy, statystyki, waga, durability/sharpness, model i zastosowania należy ustalić po codebase reconnaissance.

### Pozostałe przedmioty

Podczas analizy należy zidentyfikować brakujące narzędzia / przedmioty dla:

- Farmer,
- Woodcutter,
- Fisher,
- Trader,
- Guard,
- Miner,
- Blacksmith.

Nie dodawać przedmiotów tylko dlatego, że są historycznie typowe dla zawodu. Każdy nowy item powinien mieć konkretną funkcję w istniejącym systemie.

## 9. Generowanie profesji w osadach

Generowanie NPC powinno uwzględniać **potrzeby osady dotyczące profesji**, a nie wyłącznie losowy rozkład zawodów.

Docelowo:

```text
village size
      ↓
population range
      ↓
profession requirements
      ↓
environment / resources
      ↓
household / NPC generation
```

Nie chcemy np. wioski z dużą liczbą Farmerów i bez podstawowych zawodów potrzebnych do jej funkcjonowania.

Dolne limity populacji wiosek prawdopodobnie należy podnieść, jeżeli obecne minimum nie pozwala obsadzić wymaganych profesji.

### Profesje obowiązkowe a opcjonalne

Nie każda profesja musi występować w każdej osadzie.

Przykładowo:

```text
rzeka / jezioro → większa potrzeba Fisher
las              → większa potrzeba Woodcutter
złoża             → potrzeba Miner
większa populacja → Trader / Blacksmith / więcej specjalistów
```

Hunter pozostaje zależny od jego osobnego planu i środowiska.

Dokładne minima/maksima profesji oraz progi wielkości wioski zostaną ustalone **po analizie obecnego generatora osad i NPC**.

## 10. Redundancja profesji

Nie każda profesja powinna mieć dokładnie jednego NPC.

Model powinien rozróżniać:

- minimum potrzebne do funkcjonowania,
- docelową liczbę,
- dodatkowe zapotrzebowanie wynikające z wielkości osady i środowiska.

Przykładowo:

```text
Farmer    → wielu
Woodcutter → kilku
Guard      → kilku / zależnie od osady
Trader     → zwykle mało
Blacksmith → zwykle mało
```

Dokładne wartości są do ustalenia po analizie generatora.

## 11. Profesja jako część ekonomii

Profesja powinna uczestniczyć w istniejącym przepływie ekonomicznym:

```text
resources
    ↓
work / profession
    ↓
production / gathering
    ↓
household stock
    ↓
consumption / storage / surplus
    ↓
settlement economy / trade
```

Nie tworzyć osobnych ekonomii dla poszczególnych profesji.

## 12. Integracja z istniejącymi mechanizmami

Podczas implementation reconnaissance należy sprawdzić i wykorzystać istniejące:

- `NpcAgent`,
- `Role` / profession definitions,
- `Schedule`,
- decision / pressure / strategy / action flow,
- `Household`,
- settlement generation,
- settlement economy,
- storage,
- inventory / item instances,
- item catalog / capabilities,
- melee / ranged / defense item configs,
- agriculture / cultivation,
- fauna / livestock,
- fishing,
- mining / resource deposits,
- weapon maintenance,
- NPC combat,
- social places,
- genealogy / family generation,
- age / physical state.

Nie zakładać, że planowane mechanizmy są już zaimplementowane. Kod jest źródłem prawdy.

## 13. Codebase reconnaissance — wymagane przed implementacją

Pierwszym etapem realizacji planu jest dokładny przegląd kodu.

Należy ustalić:

1. Gdzie obecnie definiowane są role/profesje.
2. Jak profesja trafia do `CharacterDef` / `FamilyMember` / `NpcAgent`.
3. Jak generowane są rodziny i populacja osady.
4. Jak ustalana jest wielkość wioski i minimalna populacja.
5. Jak działa obecny schedule i jego akcje.
6. Jak plan 178 integruje profesję z household.
7. Jak obecne profesje `woodcutter`, `farmer`, `guard`, `trader`, `miner`, `fisher` są używane w kodzie.
8. Które czynności tych profesji są już rzeczywiście zaimplementowane.
9. Jakie istnieją itemy i capability mogą zostać ponownie użyte.
10. Jak działają weapon/tool capabilities po planie 184.
11. Jak działa role-based carried weapon po planie 185.
12. Jak obecny system age/physical state może ograniczać pracę.
13. Jak działają households i przepływ zasobów po planie 069.
14. Jak działa ekonomia i handel.
15. Jak social places są lub będą podłączone do schedule/decision flow.
16. Gdzie najlepiej podłączyć profesję do istniejącego decision modelu bez tworzenia równoległego AI.

Po tym etapie należy zaktualizować ten plan o rzeczywiste pliki, typy, zależności i ograniczenia.

## 14. Poza zakresem

- `HelpCall` / wezwanie o pomoc dla Guard — osobny plan,
- pełny Healer / Herbalist — osobny plan,
- ponowna implementacja Hunter — plan 178,
- LLM-driven simulation,
- osobny profession scheduler,
- osobny Profession AI,
- osobny household AI,
- osobna ekonomia dla zawodów,
- pełny system social places — plan 151,
- zaawansowane automatyczne rolnictwo,
- pełny system produkcji Blacksmitha, jeżeli wymagane mechanizmy nie istnieją jeszcze w codebase — zakres do rozbicia po reconnaissance.

## 15. Verification

### Technical

Po implementacji:

- testy jednostkowe dla profession mapping,
- testy age → work intensity,
- testy profession inheritance/generation,
- testy minimalnej obsady profesji w osadzie,
- testy item capability mapping,
- testy household/profession resource flow,
- typecheck,
- lint,
- build,
- pełny test suite.

### Browser / gameplay

Sprawdzić reprezentatywną małą, średnią i dużą osadę:

1. wymagane profesje są obecne,
2. profesje są sensownie rozłożone względem wielkości i środowiska,
3. rodziny mogą wspólnie wykonywać pracę,
4. duże dzieci pomagają przez ograniczoną część czasu,
5. dorośli pracują normalnie,
6. starzy pracują prawie normalnie, ale częściej odpoczywają/spacerują/łowią,
7. bardzo starzy wykonują tylko lekką pomoc i spokojne aktywności,
8. profesja nie blokuje życia społecznego i wolnego czasu,
9. Farmer korzysta z odpowiednich narzędzi,
10. Blacksmith otrzymuje potrzebne zasoby,
11. Guard ma prawidłowy rytm dzień/noc,
12. Miner wykonuje kopanie,
13. Woodcutter pozyskuje drewno,
14. Fisher łowi ryby,
15. Trader pozostaje głównie przy miejscu handlu,
16. Hunter działa zgodnie z planem 178.

Nie uznawać browser/gameplay za zweryfikowane bez rzeczywistego playtestu.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
