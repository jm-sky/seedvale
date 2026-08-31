# Plan: NPC & Animal Target Commitment

**Created:** 2026-08-31
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~177~~ ~~179~~
**Domain:** `npc`
**Tags:** `fauna` `combat` `ai`

## 1. Cel

Wprowadzić wspólny mechanizm **target commitment** dla NPC i zwierząt. Agent, który wybierze konkretny cel, powinien trzymać się go podczas bieżącej strategii i zmienić dopiero po wystąpieniu uzasadnionego warunku.

Dotyczy to m.in.:

- wilk → sarna podczas polowania,
- wilk → NPC podczas ataku na osadę,
- NPC hunter → zwierzę,
- NPC → zwierzę podczas obrony,
- NPC → NPC podczas walki.

Nie chodzi o stworzenie nowego AI ani nowego combat systemu.

## 2. Recon aktualnego codebase

Repozytorium ma już większość potrzebnych klocków:

- `src/simulation/scoreActions.ts` — wspólny wybór najwyżej ocenionej decyzji,
- `src/fauna/predatorHumanDecision.ts` — scoring attack/flee,
- `src/ai/npcAnimalThreat.ts` — scoring defend/flee,
- `src/combat/combatIntent.ts` — `CombatIntent` i `CombatTargetHandle`,
- `src/fauna/faunaCombat.ts` — target handle dla zwierzęcia,
- `NpcAgent.beginCombat()` — wykonanie dostarczonej intencji,
- `AnimalAgent` — predator/prey chase oraz NPC targeting,
- hunter target selection przez `fauna/huntingHooks.ts`.

Istniejące systemy używają więc już scoringu i stabilnego kontraktu combat targetu.

Brakującym elementem jest **wspólny lifecycle commitmentu do wybranego celu**.

Plan 179 pozostaje źródłem zachowania frenzy/animal-threat; ten plan poprawia jego stabilność i uogólnia zasadę targetowania.

## 3. Docelowy przepływ

    Perception
        ↓
    Candidate targets
        ↓
    Decision / Utility scoring
        ↓
    Target selection
        ↓
    TARGET COMMITMENT
        ↓
    Strategy / Action
        ↓
    Target validation
        ↓
    continue OR release
        ↓
    new decision

Decision, target selection i wykonanie akcji nie powinny być jednym mechanizmem.

## 4. Target commitment

Dodać małą, generyczną abstrakcję reprezentującą zobowiązanie agenta do konkretnego celu.

Agent pozostaje właścicielem swojego commitmentu:

    AnimalAgent
      └─ current target commitment

    NpcAgent
      └─ current target commitment

Nie tworzyć globalnego `TargetManager`, registry wszystkich targetów ani nowego update loop.

Mechanizm powinien umożliwiać:

- commit wybranego targetu,
- odczyt aktualnego targetu,
- walidację,
- release,
- ponowny wybór po release.

Jeżeli sensowniejsze będzie użycie istniejącego `CombatTargetHandle`, należy go wykorzystać dla combat, ale nie ograniczać całego mechanizmu target commitment wyłącznie do walki.

## 5. Najważniejsza zasada

Po wybraniu targetu:

    target A
       ↓
    COMMIT
       ↓
    chase / attack / interact

nie należy ponownie wybierać celu tylko dlatego, że minął kolejny tick albo pojawił się inny kandydat.

Przykład:

    Deer A score = 80
    Deer B score = 85

Jeżeli wilk jest już committed do Deer A, nie powinien automatycznie przełączyć się na Deer B.

## 6. Kiedy wolno zmienić target

Commitment może zostać zwolniony, gdy:

- target umarł,
- target został usunięty,
- target przestał być osiągalny zgodnie z istniejącymi regułami,
- target przestał spełniać warunki bieżącej strategii,
- strategia została zakończona,
- wystąpił istniejący, rzeczywiście wyższy priorytet/interruption.

Nie traktować chwilowej zmiany odległości lub niewielkiej różnicy utility jako powodu do przełączenia.

Jeżeli potrzebne będzie przełączanie na znacznie lepszy target, zastosować hysteresis / switch threshold zamiast bezwarunkowego re-targetingu.

## 7. Combat

Istniejący `CombatTargetHandle` pozostaje kontraktem wykonawczym combat.

Docelowo:

    decision
      ↓
    commit target
      ↓
    CombatIntent
      ↓
    NpcAgent combat phase

Combat nadal rewaliduje target przy wykonaniu ataku.

Po śmierci/utracie targetu combat kończy się przez istniejący lifecycle, a commitment może zostać zwolniony.

Nie tworzyć drugiego combat pipeline.

## 8. Fauna

### Wolf → deer

Wybór sarny powinien prowadzić do commitmentu:

    wolf selects deer A
        ↓
    commit deer A
        ↓
    chase A
        ↓
    attack A

Pojawienie się bliższej sarny B nie zmienia celu samo w sobie.

### Frenzy wolf → NPC

Istniejący model:

    strategic target = village
        ↓
    NPC detected
        ↓
    combat target = NPC A
        ↓
    chase/attack NPC A

Po znalezieniu NPC wilk powinien przestać przełączać się między wioską i NPC oraz między różnymi NPC bez uzasadnionej przyczyny.

Po utracie NPC commitment jest zwalniany i można wybrać kolejny target.

### Hunter

Istniejący bounded/deterministic target selection z `huntingHooks.ts` powinien korzystać z tego samego lifecycle, bez zmiany samego algorytmu wyboru.

## 9. NPC

### Obrona przed zwierzęciem

Istniejący:

    ImmediateAnimalThreat
        ↓
    decideAnimalThreatResponse()
        ↓
    defend / flee

pozostaje bez zmian semantycznych.

Jeżeli NPC wybiera defend:

    defend
      ↓
    commit threatening animal
      ↓
    CombatIntent
      ↓
    existing NPC Combat

Jeżeli wybiera flee, commitment powinien stabilizować bieżący threat/escape context, a ruch nadal korzysta z istniejącego pipeline.

### NPC vs NPC

Po rozpoczęciu combat NPC powinien utrzymywać wybrany combat target aż do zakończenia/utraty walki.

Nie pozwalać zwykłemu utility reselectowi przełączać przeciwnika co tick.

## 10. Utility AI

Nie zastępować obecnego `pickHighestScore()`.

Docelowy podział:

    Perception
      → co istnieje / co jest zagrożeniem?

    Decision
      → co powinienem zrobić?

    Target selection
      → czego / kogo dotyczy decyzja?

    Commitment
      → jak długo trzymam się celu?

    Strategy / Action
      → jak wykonuję decyzję?

Obecne `if/else` mogą pozostać jako kontrola lifecycle/phase/interruptów. Nie należy mechanicznie zamieniać wszystkich warunków na macierz utility.

Scoring wybiera spośród sensownych kandydatów; commitment zapewnia stabilność po wyborze.

## 11. Performance

Mechanizm ma zmniejszyć zbędne target selection, a nie zwiększyć koszt.

Wykorzystać:

- istniejącą lokalną percepcję,
- bounded candidate lists,
- istniejące update frequencies,
- przechowywanie aktualnego targetu.

Nie dodawać:

- globalnego skanu animals × NPCs,
- globalnego target registry,
- nowego per-frame managera,
- Web Workera.

## 12. Zakres

### W zakresie

- recon wszystkich aktualnych target-selection paths NPC/fauna,
- generyczny target commitment lifecycle,
- integracja z `AnimalAgent`,
- integracja z `NpcAgent`,
- integracja z istniejącym NPC combat,
- predator/prey target selection,
- hunter target selection,
- target validation/release,
- ograniczenie target thrashing,
- testy commitment lifecycle,
- testy invalidacji i ponownego wyboru,
- browser verification.

### Poza zakresem

- nowy combat system,
- nowy threat manager,
- nowy pathfinding,
- pełny GOAP,
- pełny rewrite Utility AI,
- globalna macierz decyzji dla całego świata,
- pack AI,
- koordynacja wilków,
- persistence commitmentów,
- multiplayer synchronization.

## 13. Relevant files

Pierwszy recon powinien obejmować:

- `src/ai/NpcAgent.ts`
- `src/ai/npcAnimalThreat.ts`
- `src/ai/npcCombat.ts`
- `src/combat/combatIntent.ts`
- `src/fauna/AnimalAgent.ts`
- `src/fauna/faunaCombat.ts`
- `src/fauna/predatorHumanDecision.ts`
- `src/fauna/huntingHooks.ts`
- `src/simulation/scoreActions.ts`

oraz wszystkie aktualne call sites wyboru targetów i `beginCombat()`.

Nie zakładać, że lista jest kompletna — przed implementacją wykonać skoncentrowany search.

## 14. Acceptance criteria

### Polowanie

    wolf selects deer A
    → keeps deer A
    → deer B becomes closer
    → does NOT switch

    deer A becomes invalid
    → release
    → new target may be selected

### Walka

    NPC selects wolf A
    → keeps wolf A

    wolf B appears
    → no immediate switch

    wolf A dies
    → combat/commitment ends
    → new decision may select wolf B

### Frenzy

    setFrenzyWolf()
    → wolf enters village

    NPC A detected
    → commit NPC A
    → chase NPC A
    → attack NPC A

    NPC B becomes closer
    → continue NPC A

    NPC A becomes invalid
    → release
    → select next valid NPC

### NPC defense

    wolf threatens NPC
    → ImmediateAnimalThreat
    → existing defend/flee scoring

    defend
    → commit wolf
    → existing NPC Combat

    flee
    → existing flee/movement pipeline

### Stabilność

Agent nie zmienia celu/kierunku co tick bez rzeczywistej zmiany sytuacji.

## 15. Verification

Automatycznie:

- commit/reuse/release,
- target invalidation,
- no re-selection while valid,
- re-selection after invalidation,
- deterministic selection,
- existing predator decision tests,
- existing animal-threat tests,
- existing combat tests,
- typecheck,
- lint,
- build,
- full test suite.

Browser:

- wolf → deer,
- wolf → NPC in village,
- NPC defend,
- NPC flee when appropriate,
- multiple nearby targets,
- target death,
- target leaving valid range,
- brak widocznego target thrashing,
- frenzy wolf ignoring fire while maintaining one NPC target.

## 16. Architectural outcome

Po implementacji chcemy mieć prostą zasadę obowiązującą w całym AI:

> **Utility wybiera cel. Commitment utrzymuje cel. Validation decyduje, kiedy cel przestał być ważny.**

To ma być wspólny mechanizm dla NPC i fauna, bez tworzenia równoległego systemu AI.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
