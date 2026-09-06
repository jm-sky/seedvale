# Plan: Reputation & Renown Foundation

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `quests-progression`
**Subdomains:** `relationships` `progression`
**Tags:** `reputation` `renown` `npc-social`
**Roadmap:** `quests-and-reputation.md`

## Cel

Wprowadzić prawdziwy system reputacji i rozpoznawalności gracza, niezależny od osobistych relacji z NPC i od badge'y.

System dostarcza dwa nowe rodzaje lokalnego stanu społecznego:

- **Reputation** — jak dana społeczność ocenia społeczne cechy gracza,
- **Renown** — jak szeroko gracz jest w tej społeczności znany.

Pierwsza wersja jest lokalna dla osady, persistent i ma rzeczywiste źródła oraz konsumenta gameplayowego. Nie obejmuje jeszcze ogólnego mechanizmu świadków/przepływu informacji ani pełnej przebudowy quest rewards.

## Model społeczny

Zachować cztery rozdzielne koncepty:

```text
Relation    = co konkretny NPC myśli o graczu
Reputation  = jak społeczność ocenia społeczne cechy gracza
Renown      = jak szeroko gracz jest znany w tej społeczności
Known for   = konkretne trwałe fakty o czynach gracza (badges/history)
```

### Relation

Relation pozostaje obecnym per-NPC stanem zarządzanym przez `QuestManager`. Nie przenosić go do nowego systemu w tym planie. Pozostaje silniejszym sygnałem w interakcjach osobistych niż publiczna rozpoznawalność.

### Reputation

Reputation jest przechowywana per settlement i ma pięć wymiarów:

```ts
type ReputationDimension =
  | 'trust'
  | 'competence'
  | 'benevolence'
  | 'courage'
  | 'integrity'
```

- `trust` — czy na graczu można polegać,
- `competence` — czy społeczność postrzega gracza jako skutecznego i zaradnego,
- `benevolence` — czy działa na rzecz innych,
- `courage` — czy podejmuje ryzyko w istotnych sytuacjach,
- `integrity` — czy jest postrzegany jako uczciwy i respektujący normy.

Każdy wymiar używa skali `-100..100`, z neutralnym `0`, i jest clampowany do tego zakresu.

`competence` oznacza ogólną społeczną opinię „ten człowiek potrafi sobie poradzić”. Nie rozbijać jej w tym systemie na `huntingCompetence`, `workCompetence` itd. Konkretna wiedza/umiejętności mogą później należeć do skills, attributes, badges/history lub innych właściwych domen.

Nie tworzyć jednego globalnego `reputationScore` ani średniej wszystkich wymiarów.

### Renown

Renown opisuje rozpoznawalność, a nie ocenę moralną lub społeczną. Używa skali `0..100`, startuje od `0` i jest clampowany do tego zakresu.

Publiczne negatywne zdarzenie może zwiększać renown jednocześnie pogarszając reputation. Nie istnieje osobna „zła sława”: reprezentuje ją wysokie renown + negatywna reputation.

Stage 1 nie implementuje decay renown ani żadnego źródła jego spadku, ale API nie powinno zakładać, że renown z definicji nigdy nie może maleć.

## 1. Authoritative ReputationManager

Dodać:

```text
src/reputation/ReputationManager.ts
```

`ReputationManager` jest jedynym właścicielem lokalnej reputation i renown.

Użyć jawnego modelu rozdzielającego oba koncepty:

```ts
type Reputation = {
  trust: number
  competence: number
  benevolence: number
  courage: number
  integrity: number
}

type SettlementSocialStanding = {
  reputation: Reputation
  renown: number
}
```

Stan jest keyed przez stabilny `settlementId`.

Publiczne API ma używać nazw:

```ts
getReputation(settlementId)
getReputationDimension(settlementId, dimension)
changeReputation(settlementId, dimension, delta)
getRenown(settlementId)
changeRenown(settlementId, delta)
reset()
exportState()
```

Dopuszczalne są dodatkowe prywatne helpery, ale nie zastępować powyższego kontraktu równoległym API.

Zasady:

- brak wpisu dla settlementu oznacza neutralne reputation i `renown = 0`,
- read nie tworzy wpisu tylko po to, aby zwrócić neutralny stan,
- reputation clamp `-100..100`,
- renown clamp `0..100`,
- zmiany są deterministyczne,
- brak pracy per frame,
- `ReputationManager` nie zależy od `QuestManager`,
- `QuestManager` nie jest właścicielem reputation/renown.

Dodać JSDoc dla publicznych typów i managera z `@domain quests-progression` tam, gdzie poprawi to preflight discovery.

## 2. Persistence

Reputation jest osobnym top-level segmentem `SaveData`, nie częścią `quests`.

Docelowy kształt:

```ts
reputation: {
  settlements: Record<string, {
    reputation: {
      trust: number
      competence: number
      benevolence: number
      courage: number
      integrity: number
    }
    renown: number
  }>
}
```

Uwzględnić serialization, validation, restore i New Game/reset.

Starszy save bez `reputation` otrzymuje pusty stan, czyli wszystkie settlementy są neutralne do pierwszej zmiany.

Nie migrować `QuestManager.getPlayerStanding()` do reputation ani renown — jest to pochodna relations, nie historyczny stan społeczny.

Sprawdzić co najmniej `src/persistence/saveData.ts`, `src/app/saveState.ts`, persistence tests oraz fixtures tworzące pełny `SaveData`.

## 3. PlayerSocialLookup

Zachować istniejący dependency-injection path zamiast importować managery do NPC:

```text
createApp
→ worldBundle
→ SettlementsManager
→ createSettlement
→ NpcAgent
```

Zmienić `PlayerSocialLookup` na jawny settlement-aware kontrakt:

```ts
type PlayerSocialContext = {
  npcName: string
  settlementId: string
}

type PlayerSocialState = {
  relationLevel: RelationLevel
  reputation: Readonly<Reputation>
  renown: number
}

type PlayerSocialLookup = (context: PlayerSocialContext) => PlayerSocialState
```

Nie rozwiązywać settlementu przez globalne skanowanie NPC po nazwie.

Consumer używa tylko potrzebnych pól. Istniejące mechanizmy oparte wyłącznie na relation, np. lodging, zachowują obecne zachowanie.

## 4. NPC reactions: relation + local renown

Usunąć pseudo-reputation pochodzącą ze średniej relations z `computeReactionChance()`.

Spontaniczna reakcja NPC używa:

```text
personal relation
+ local renown
+ existing personality / traits / crowd suppression
```

Relation odpowiada za osobisty powód reakcji. Renown odpowiada za to, że gracz jest rozpoznawalny w danej osadzie.

Użyć nazwy `renown` zamiast `standing` / `reputationStanding` w tym kontrakcie.

Zachować obecny balans publicznego sygnału: `renown = 100` daje maksymalnie około `+0.10` reaction chance. `trusted` relation pozostaje wyraźnie silniejsze, około `+0.30`.

Nie używać średniej `trust/competence/benevolence/courage/integrity` do spontaneous reactions.

## 5. Pierwsze realne social consequences

Stage 1 ma dostarczyć end-to-end działający system, więc dwa istniejące, znaczące i społecznie jawne questy stają się pierwszymi producentami reputation/renown.

### `grozny-wilk`

Po ukończeniu:

```text
renown       +15
competence   +10
courage      +12
benevolence   +4
```

### `wilcza-jama`

Po ukończeniu:

```text
renown       +25
competence   +15
courage      +18
benevolence   +6
```

Nie zmieniają `trust` ani `integrity`.

Nie każdy quest daje reputation/renown i nie istnieją default social effects.

### Trwały seam dla quest consequences

Nie importować `ReputationManager` bezpośrednio do `QuestManager`.

Rozszerzyć dependency injection `QuestManager` o narrow callback nazwany:

```ts
applySocialConsequence(consequence)
```

Konsekwencja ma wskazywać `settlementId` oraz jawne delty reputation/renown potrzebne do wykonania danego questa. `QuestManager` decyduje, kiedy completion nastąpiło dokładnie raz; aplikacja/composition root mapuje consequence na `ReputationManager`.

Nie budować w tym planie ogólnego effects engine ani event busa. Ten seam ma pozwolić kolejnemu planowi quest foundations rozwinąć consequences bez sprzęgania questów z właścicielem reputation.

## 6. Reputation dimensions bez sztucznych consumerów

Nie dodawać reguł tylko po to, aby każdy wymiar był już używany.

Przyszłe naturalne zastosowania mogą obejmować:

```text
trust + integrity   → powierzanie wartości / odpowiedzialności
competence          → praca / ważne zadania
competence+courage  → zagrożenia
benevolence         → społeczne prośby
```

Są poza scope tego planu.

## 7. Relation pozostaje personal signal

Nie zmieniać ownership relation ani istniejących relation gates.

System musi reprezentować bez konfliktu np.:

```text
NPC dislikes player personally
+
settlement considers player highly competent
```

Nie zmieniać lodging/access rules tylko dlatego, że reputation jest teraz dostępna.

## 8. BadgeManager i stary pseudo-standing

`BadgeManager` pozostaje właścicielem earned badges i counters potrzebnych do ich odblokowania.

Usunąć `communityOffensePenalty()` oraz logikę łączenia jej z `QuestManager.getPlayerStanding()`.

Zachować `grave_robber`, `desecrator` i ich counters.

Naruszenie grobu nie zmienia jeszcze `integrity`, ponieważ obecnie nie ma mechanizmu świadków ani społecznego poznania zdarzenia. Symulacja nie może zmieniać settlement reputation tylko dlatego, że sama zna prywatny czyn gracza.

Badge sam z siebie nie modyfikuje reputation. Event, który doprowadził do badge'a, może kiedyś niezależnie wywołać social consequence, jeśli stał się społecznie znany.

## 9. Character Screen

Usunąć pojedynczy `standing` z modelu Character Screen.

Pokazać osobno:

```text
Reputacja — <Settlement>

Zaufanie
Kompetencja
Życzliwość
Odwaga
Uczciwość

Rozpoznawalność

Znany z
[badges...]
```

Stage 1 pokazuje wartości liczbowe reputation (`-100..100`) i renown (`0..100`) dla łatwego balansowania.

Nie utrwalać jednego wspólnego domenowego tieru typu `poor/good/excellent` dla wszystkich dimensions — znaczenie wartości zależy od konkretnej cechy (`courage -80` i `integrity -80` opisują różne rzeczy). Jeśli UI potrzebuje opisowych etykiet, mają być presentation concern i semantycznie odpowiadać konkretnej cesze.

Dla renown UI może używać presentation-only progów rozpoznawalności, jeśli jest to użyteczne, ale nie zapisywać tieru jako state ani nie budować na nim gameplay logic.

### Settlement context

Character Screen pokazuje reputation settlementu aktualnie istotnego dla pozycji/kontekstu gracza, wykorzystując istniejący world/settlement lookup. Nie dodawać UI-owned `currentSettlementId`.

Poza kontekstem settlementu nie pokazywać przypadkowej/ostatniej osady. Pokazać komunikat `Brak lokalnej reputacji` i nadal wyświetlać badges.

Nie tworzyć globalnego reputation score dla UI.

## 10. Zasada wiedzy społecznej

Kontrakt systemu:

> Reputation lub renown zmieniają się tylko wtedy, gdy konkretna integracja ma podstawę uznać, że czyn stał się społecznie znany.

Stage 1 nie implementuje witness detection, gossip, NPC-to-NPC information propagation, cross-settlement propagation, regional reputation ani global renown.

Na tym etapie odpowiedzialność za poprawność social consequence leży po stronie jawnego call site.

Nie budować centralnego `ReputationEventProcessor` ani nowego event busa. Inne domeny mogą korzystać bezpośrednio z narrow composition-root integration z `ReputationManager` odpowiedniej dla danego systemu.

## 11. Brak decay i propagacji

Stage 1 nie implementuje:

- reputation decay,
- renown decay,
- cross-settlement propagation,
- regional reputation,
- world reputation,
- global fame.

Każdy settlement ma niezależny stan.

API `changeRenown()` obsługuje dodatnią i ujemną deltę z clamp `0..100`, aby fundament nie kodował niepotrzebnego założenia „renown nigdy nie maleje”. Stage 1 nie dodaje jednak żadnego ujemnego source.

## 12. Testy ReputationManager

Dodać unit tests obejmujące co najmniej:

- neutral state dla nieznanej osady,
- read bez niepotrzebnej materializacji wpisu,
- niezależność dwóch settlementów,
- niezależność pięciu dimensions,
- dodatnie i ujemne zmiany reputation,
- clamp reputation `-100..100`,
- renown start `0`,
- dodatnie i ujemne delty renown,
- clamp renown `0..100`,
- renown niezależny od reputation,
- export/restore,
- reset.

## 13. Reaction tests

Rozszerzyć tests `computeReactionChance`:

- renown wpływa na reaction chance,
- `renown = 0` zachowuje bazowe zachowanie,
- `renown = 100` daje maksymalnie około `+0.10`,
- relation nadal ma większy wpływ niż renown,
- reputation dimensions nie są automatycznie uśredniane do reaction chance.

## 14. Quest social-consequence tests

Dodać testy potwierdzające dokładne delty `grozny-wilk` i `wilcza-jama`.

Sprawdzić:

- consequence jest zastosowana dokładnie raz,
- failed/incomplete quest nie daje consequence,
- `trust` i `integrity` pozostają bez zmian,
- reward item/EXP/relation zachowują swój obecny niezależny lifecycle.

## 15. Persistence i social lookup tests

Rozszerzyć persistence tests o:

- zapis kilku settlementów,
- restore wszystkich dimensions i renown,
- backward-compatible save bez `reputation`,
- validation nieprawidłowego shape/value zgodnie z obecnym stylem validatora,
- New Game reset.

Zaktualizować wszystkie fixtures pełnego `SaveData`.

Zaktualizować mocki `PlayerSocialLookup` i sprawdzić:

- relation właściwego NPC,
- reputation/renown właściwego `settlementId`,
- różne settlementy mogą mieć różne social state,
- lodging nadal zależy wyłącznie od relation.

## 16. Badge tests

Usunąć tests `communityOffensePenalty()` i zachować badge progression tests.

Potwierdzić, że grave-related event bez jawnej social consequence nie zmienia reputation.

## 17. Dokumentacja i implementation notes

Po wdrożeniu zaktualizować canonical state docs tam, gdzie kontrakt social state/persistence stanie się nieaktualny. Sprawdzić co najmniej:

```text
docs/state/npc.md
docs/state/persistence.md
```

Dodać implementation notes zgodnie z `docs/plans/PLANNING.md`.

Implementation notes powinny zachować tylko informacje oszczędzające ponowny recon, w szczególności:

- aktualny `PlayerSocialLookup` injection path,
- ownership relation w `QuestManager`,
- ownership reputation/renown w `ReputationManager`,
- ownership badges w `BadgeManager`,
- persistence seams,
- Character Screen legacy `standing` path,
- requirement `settlementId`,
- social consequences dwóch istniejących questów.

## Non-goals

Plan nie obejmuje:

- pełnej przebudowy quest definitions/rewards,
- ogólnego quest effects engine,
- nowych questów,
- płatnych questów,
- przebudowy/usuwania quest EXP,
- przenoszenia relation poza `QuestManager`,
- nowych relation levels,
- reputation-based quest availability,
- reputation-based pricing/lodging/work assignment,
- witness system,
- gossip/information propagation,
- decay,
- regional/global reputation,
- global fame,
- morality/crime/legal system,
- nowych badges,
- profession reputation (`hunter`, `worker`, `explorer`),
- rozbijania `competence` na kompetencje zawodowe,
- dynamicznych consumerów wszystkich pięciu dimensions.

## Architektura po wdrożeniu

```text
QuestManager
├── quest progress
├── quest EXP
└── per-NPC relation

ReputationManager
└── per settlement
    ├── reputation
    │   ├── trust        -100..100
    │   ├── competence   -100..100
    │   ├── benevolence  -100..100
    │   ├── courage      -100..100
    │   └── integrity    -100..100
    └── renown              0..100

BadgeManager
├── earned badges
└── badge progress/history counters
```

Shared social read path:

```text
QuestManager relation ───────┐
                             ├→ PlayerSocialLookup → world/settlement → NpcAgent
ReputationManager ───────────┘
```

Każdy consumer wybiera tylko te sygnały społeczne, które mają znaczenie dla konkretnej decyzji.

## Kolejność implementacji

1. Dodać reputation types, bounds i `ReputationManager`.
2. Dodać unit tests managera.
3. Dodać persistence + backward-compatible restore/reset.
4. Rozszerzyć `PlayerSocialLookup` o `settlementId`, reputation i renown.
5. Przeciągnąć nowy kontrakt przez istniejący injection path.
6. Zastąpić pseudo-standing w NPC reactions przez local renown.
7. Dodać `applySocialConsequence` i consequences `grozny-wilk` / `wilcza-jama`.
8. Usunąć wszystkich pozostałych consumers `QuestManager.getPlayerStanding()`, a następnie samą metodę.
9. Usunąć `BadgeManager.communityOffensePenalty()` i stary UI standing composition.
10. Przebudować Character Screen na local reputation + renown + badges.
11. Zaktualizować tests, fixtures i persistence validation.
12. Zaktualizować canonical state docs.
13. Dodać implementation notes.

## Verification

### Automated

Uruchomić odpowiednie istniejące testy oraz standardowy zestaw wymagany przez repo dla zmian TypeScript/persistence, w szczególności:

- ReputationManager tests,
- QuestManager tests,
- reaction chance tests,
- BadgeManager tests,
- persistence/save validation tests,
- lodging/social lookup tests,
- typecheck,
- build.

Nie uruchamiać `pnpm docs:sync` ręcznie — synchronizacja dokumentacji odbywa się przez GitHub workflow.

### Manual — User

User sprawdza w przeglądarce:

1. Character Screen nie pokazuje starego `community standing`.
2. W lokalnym kontekście osady widoczne są pięć dimensions reputation, renown i istniejące badges.
3. Poza settlementem nie są pokazywane dane przypadkowej osady.
4. Nowa gra zaczyna z neutralną reputation i `renown = 0`.
5. Save/load zachowuje reputation i renown.
6. Existing relations nadal wpływają na NPC i lodging jak wcześniej.
7. `grozny-wilk` daje dokładnie: renown +15, competence +10, courage +12, benevolence +4.
8. `wilcza-jama` daje dokładnie: renown +25, competence +15, courage +18, benevolence +6.
9. Spontaniczne NPC reactions uwzględniają local renown.
10. Grave-related badges nadal działają, ale naruszenie grobu bez społecznej wiedzy nie zmienia reputation.
11. Nie ma zauważalnego per-frame overhead związanego z nowym systemem.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
