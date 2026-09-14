# Plan: Household wells and population scaling

**Created:** 2026-09-14
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `settlements-npcs`
**Subdomains:** `household` `logistics`
**Tags:** `water` `well` `village-generation` `npc-needs`
**Roadmap:** -
**Model:** Sonnet, Composer

## Cel

Zmniejszyć przeciążenie jednej centralnej studni osady przez deterministyczne dodanie studni przy householdach, bez tworzenia nowego systemu wody, kolejek ani persistence.

Studnia centralna pozostaje wspólną infrastrukturą osady. Dodatkowe studnie są lokalnymi źródłami przy householdach i mają korzystać z istniejącego flow NPC water/waterDuty oraz istniejącego `InteractionQueue`.

Ten plan jest szybkim fixem przed późniejszym, bardziej systemowym rozwojem studni, np. questami typu „Pomóż mi zbudować studnię przed domem”, awariami, naprawami i budową nowych studni przez osadę.

## Stan obecny

Zweryfikowany kod zakłada obecnie jedną studnię settlementu:

- `src/settlement/villagePlanner.ts`
  - zawsze tworzy dokładnie jeden `plot-infra-well`, wymuszony w `VillageCenter`;
  - `VILLAGE_SIZE_CONFIG.infrastructure.wells` istnieje, ale planner nie używa tej liczby do generowania wielu studni;
- `src/settlement/villagePlan.ts`
  - `VillageLandmarkKind` zawiera `well`, a `VillageLandmarkPlan.index` pozwala reprezentować wiele landmarków tego samego typu;
- `src/settlement/props.ts`
  - `SettlementLandmarks.well` i `wellProp` są singletonami runtime;
- `src/settlement/createSettlement.ts`
  - tworzy jeden `wellQueueId(def.id)` i jedną kolejkę `InteractionQueue` z `servingCapacity: 1`;
- `src/ai/NpcAgent.ts`
  - `resolveWaterWellTarget()` porównuje centralną studnię osady z pobliską ukończoną player-built well;
  - `water` i `waterDuty` używają tej samej centralnej kolejki, gdy celem jest village well;
- `src/simulation/interactionQueue.ts`
  - istniejący `InteractionQueue` jest generyczny i powinien zostać użyty osobno dla każdej studni;
- `src/settlement/createSettlement.ts`
  - households są już stabilnie powiązane `familyIndex -> home -> Household`;
- `src/settlement/householdYard.ts`
  - yard ma własny kontrakt geometrii dla beczki/koryta/storage; studnia nie powinna być dokładana jako przypadkowy yard prop bez osobnego placementu i spacingu.

## Zasady generacji household wells

Centralna studnia osady zawsze pozostaje.

Dla każdego householdu wyznaczyć deterministycznie kandydaturę na dodatkową studnię:

1. household z **3+ mieszkańców** → studnia **100%**;
2. household z **2 mieszkańcami** → studnia z deterministyczną szansą **50%**;
3. household z **1 mieszkańcem** → bez studni z podstawowej reguły.

Następnie zastosować gwarancję populacyjną:

```text
minimumHouseholdWellCount = floor(totalPopulation / 6)
```

To jest liczba **dodatkowych household wells**, niezależna od centralnej studni osady.

Jeżeli podstawowe reguły dadzą mniej studni niż `minimumHouseholdWellCount`:

1. najpierw promować do 100% householdy 2-osobowe, które nie dostały studni z losowania 50%;
2. jeśli nadal brakuje kandydatów, deterministycznie wybrać pozostałe householdy bez studni, preferując większą liczbę mieszkańców, a przy remisie stabilny `familyIndex` / seed-derived tie-break;
3. nie tworzyć więcej niż jednej household well dla jednego householdu.

Przykłady:

```text
5 mieszkańców → gwarancja 0 household wells, ale reguły 3+/2 mogą nadal je wygenerować
6 mieszkańców → minimum 1 household well + centralna
12 mieszkańców → minimum 2 household wells + centralna
18 mieszkańców → minimum 3 household wells + centralna
```

Losowanie 50% musi być deterministyczne z istniejącego settlement/family seed flow. Nie używać `Math.random()`.

## Placement

Household well ma być umieszczana przy domu/householdzie, ale nie jako zwykły yard prop doklejony do istniejącego `householdYardRadius()`.

Preferowany flow:

```text
families / house plots
→ select household wells
→ dla wybranego householdu osobny infrastructure plot
→ attractor = jego house plot / home
→ normalne terrain / slope / river / spacing checks przez istniejący `pickPlot()`
```

Wykorzystać istniejący `pickPlot()` zamiast tworzyć osobny algorytm placementu.

Household well jest local-attractor plotem: `attractor` + twarde `minAttractorDistance`/`maxAttractorDistance` (pas z `householdYardRadius()` / house radius / well radius). `pickPlot()` sampluje i robi fallback wokół domu, nie po pierścieniu osady; `attractor` nie jest tylko scoringiem. Placement odrzuca przyszłe plaza corridors (`center→house`, `center→zone`, predicted entrances) pełną kapsułą — bez czekania na `VillagePathPlan[]`.

Household well powinna:

- być blisko własnego domu;
- respektować spacing względem domu, innych propsów i innych studni;
- respektować river footprint rejection i terrain gates;
- nie przesuwać ani nie zastępować centralnej studni;
- mieć stabilny id zależny od `familyIndex`, np. semantycznie `plot-household-well-{familyIndex}` / odpowiadający landmark id.

Nie zmieniać w tym planie generatora households w klastry rodzinne ani nie dodawać genealogii.

## Model runtime

Usunąć założenie, że settlement ma tylko jedno usable well source.

Preferowany model:

```text
SettlementWell[]
  id
  position
  prop
  queueId
  householdId? / familyIndex?   // lokalna affinity, nie pełne prawo własności
  isCentral
```

Nazwa konkretnego typu może być dostosowana do aktualnego kodu podczas implementacji, ale ownership powinien pozostać po stronie settlement runtime, nie `Household.water`.

`Household.water` nadal jest jedynym household-owned zapasem wody. Studnia jest źródłem, nie drugim magazynem householdu.

Dla kompatybilności istniejące `landmarks.well` może pozostać aliasem do centralnej studni, jeśli znacząco ogranicza zakres migracji call-site'ów, ale nowe zachowanie NPC musi korzystać z kolekcji dostępnych studni.

## InteractionQueue

Nie tworzyć nowego reservation/queue systemu.

Każda studnia settlementu dostaje własny istniejący `InteractionQueue`:

```text
central:   <settlementId>:well:central
household: <settlementId>:well:household:<familyIndex>
```

Dokładny format id może być inny, ale musi być stabilny i jednoznaczny.

Zachować dotychczasowe parametry startowe kolejki, w tym `servingCapacity: 1`, chyba że placement/anchor konkretnego well propa wymaga istniejącego fallbacku z `wellInteractionQueue.ts`.

Nie dodawać load balancera ani per-frame monitorowania kolejek w tym planie.

## Wybór studni przez NPC

Rozszerzyć istniejący `resolveWaterWellTarget()` zamiast tworzyć osobny system wyszukiwania wody.

Dla `water` i `waterDuty` NPC powinien wybierać najbliższe użyteczne źródło spośród:

1. lokalnych settlement wells;
2. centralnej settlement well;
3. istniejącej pobliskiej ukończonej player-built well.

Punkt odniesienia dla householdowych potrzeb powinien pozostać zgodny z obecnym flow — preferować dystans od `home`, nie od chwilowej pozycji NPC, żeby household konsekwentnie korzystał z lokalnej infrastruktury.

Nie dodawać w tym planie wyboru „najmniej obciążonej” kolejki. Najbliższa studnia wystarczy jako szybki fix; osobny congestion score może zostać dodany później, jeśli playtest pokaże potrzebę.

NPC korzystający z settlement well musi otrzymać `queueId` konkretnej wybranej studni, a nie jeden globalny `wellQueueId`.

## SFX / facing / interaction anchors

Obecny `NpcAgent` ma miejsca nadal odnoszące się bezpośrednio do `landmarks.well` dla well SFX/facing. Przy wielu studniach nie mogą one zakładać centralnej pozycji.

Przenieść potrzebny context wybranej studni przez istniejący `NpcPlannedAction` / target data albo inny najmniejszy zgodny z obecną architekturą sposób, tak aby:

- SFX były odtwarzane przy faktycznie wybranej studni;
- facing używał faktycznie wybranej studni;
- kolejka i interaction anchor należały do tej samej studni;
- player-built well nie zostały regresyjnie zepsute.

Nie tworzyć osobnej klasy akcji tylko dla household well.

## Persistence i determinism

Nie dodawać nowych pól do `SaveData`.

Household wells są częścią deterministycznego `VillagePlan`, więc powinny być rekonstruowane z:

```text
seed + family composition + familyIndex + village layout
```

Tak jak reszta settlement generation nie są persisted authoritative state.

Jeżeli zmiana wpływa na persistent worldgen cache namespace, sprawdzić fingerprint/version zgodnie z `CLAUDE.md`; nie bumpować niczego bez realnego związku. Obecnie settlement plan memoization jest in-session derived/cache, nie gameplay persistence.

`Household.water` persistence pozostaje bez zmian.

## Performance

- wybór studni wykonywać tylko przy rozpoczęciu `water` / `waterDuty`, jak obecny `resolveWaterWellTarget()`, nie co frame;
- liczba studni na settlement pozostaje mała, więc liniowy scan lokalnej kolekcji jest wystarczający;
- jedna kolejka per well jest małym, settlement-local runtime state;
- brak world-wide scanów i brak nowego managera.

## Przyszłe rozszerzenia — poza zakresem

Ten plan ma zostawić prosty seam pod późniejsze funkcje, ale ich nie implementuje:

- quest „Pomóż mi zbudować studnię przed domem”;
- budowa nowej household well po wygenerowaniu świata;
- condition / awarie / wysychanie studni;
- naprawy przez household/osadę/gracza;
- koszt materiałów i work contracts;
- formalne prawo własności household do studni;
- współdzielenie jednej local well przez kilka householdów;
- genealogiczne klastry typu rodzina/szwagier/zięć;
- congestion-aware source selection;
- naturalne źródła wody jako alternatywa NPC.

Przyszłe mutable well state powinno rozszerzyć istniejący settlement structure condition/repair lub inny istniejący owner, a nie tworzyć `WellStateManager` bez potrzeby.

## Zakres plików do weryfikacji podczas implementacji

Podstawowe:

- `src/settlement/families.ts`
- `src/settlement/villagePlan.ts`
- `src/settlement/villagePlanner.ts`
- `src/settlement/props.ts`
- `src/settlement/createSettlement.ts`
- `src/settlement/wellInteractionQueue.ts`
- `src/simulation/interactionQueue.ts`
- `src/ai/NpcAgent.ts`

Testy / fixtures, które prawdopodobnie wymagają dostosowania:

- `src/settlement/villagePlanner.test.ts`
- `src/settlement/settlementGenerator.test.ts`
- testy `SettlementLandmarks` fixtures / `places.test.ts`
- testy source-selection / NPC need flow, jeśli istnieją dla `resolveWaterWellTarget` / waterDuty
- testy `InteractionQueue`, tylko jeśli id/lookup helper zmieni publiczny kontrakt

Sprawdzić też aktualne call-site'y `SettlementLandmarks.well`, `wellProp` i `wellQueueId` przed implementacją, bo repo może się zmienić po utworzeniu planu.

## Implementation order

1. Dodać czysty, deterministyczny resolver householdów, które otrzymują well według reguł 3+ / 2=50% / population fallback.
2. Rozszerzyć `VillagePlan` / planner o household well plots + landmarks z family affinity.
3. Zmaterializować wiele well props/positions w `SettlementLandmarks` / settlement runtime, zachowując centralną studnię jako osobny, stabilny element.
4. Tworzyć jedną istniejącą `InteractionQueue` per settlement well.
5. Rozszerzyć `NpcAgent.resolveWaterWellTarget()` o nearest settlement/player well i zwrot właściwego `queueId`/target context.
6. Naprawić SFX/facing tak, aby używały wybranej studni.
7. Dodać/zmienić testy generatora, determinism, fallback `/6`, queue routing i source selection.
8. Zaktualizować `docs/state/settlements.md` po implementacji, jeżeli opis singleton well stanie się nieaktualny.

Dla ważnych nowych publicznych/architektonicznych resolverów dodać krótki JSDoc, jeśli poprawi to odkrywalność przez preflight; preferować `@domain settlements-npcs`.

## Acceptance criteria

- centralna studnia istnieje w każdej osadzie jak wcześniej;
- household 3+ mieszkańców zawsze ma własną local well;
- household 2 mieszkańców ma deterministyczne 50% szansy;
- settlement ma co najmniej `floor(totalPopulation / 6)` household wells, jeśli istnieją householdy bez studni;
- fallback najpierw promuje 2-osobowe householdy bez wylosowanej studni;
- wynik jest identyczny dla tego samego seeda/families;
- każda household well ma osobny stabilny plot/landmark/runtime id i własną `InteractionQueue`;
- NPC `water` i `waterDuty` wybierają najbliższą odpowiednią studnię zamiast zawsze centralnej;
- kilka householdów może równocześnie pobierać wodę z różnych studni;
- istniejąca player-built well nadal może zostać wybrana, gdy jest najlepszym lokalnym źródłem;
- `Household.water` i jego persistence działają bez zmian;
- brak nowego save schema / migracji;
- brak nowego water managera / queue managera / równoległego resource systemu.

## Verification

Automatycznie:

- test reguły 3+ → 100%;
- test 2 → deterministyczne 50% dla znanych seedów;
- test population fallback dla 6 / 12 / 18 mieszkańców;
- test, że fallback nie tworzy drugiej studni dla tego samego householdu;
- test determinism: ten sam seed/families → ten sam zestaw familyIndex + positions;
- test central well nadal istnieje;
- test household well placement respektuje spacing / river rejection tam, gdzie obecne test helpers to umożliwiają;
- test nearest-well selection i właściwego queue id;
- test player-built well regression;
- `npx tsc --noEmit`;
- właściwy najmniejszy zestaw testów settlement/NPC.

Browser/manual — wykonuje User:

- duża osada ma centralną studnię oraz household wells zgodnie z regułami;
- studnie stoją sensownie przy domach i nie kolidują z budynkami/yard props;
- kolejki rozdzielają się na kilka studni;
- NPC z różnych householdów faktycznie wybierają lokalne źródła;
- waterDuty wraca do właściwego domu;
- brak widocznych regresji SFX/facing/interaction;
- reload/Continue odtwarza ten sam układ studni.

> **Zrób git commit i push do main, rebase jeżeli trzeba**