# Plan: Quest Outcomes, Rewards & Consequences

**Created:** 2026-09-06
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** quests-progression-001
**Domain:** `quests-progression`
**Subdomains:** `quests` `rewards` `relationships`
**Tags:** `quests` `outcomes` `rewards` `consequences` `rpg`
**Roadmap:** `quests-and-reputation.md`

## Cel

Uporządkować model questów tak, aby wspierał:

- czytelną tożsamość questa,
- jawne nagrody,
- jawne konsekwencje,
- kilka możliwych sposobów rozwiązania jednego questa,
- różne nagrody i konsekwencje zależne od rozwiązania,
- questy RPG, contextual i późniejsze emergent quests w jednym wspólnym systemie.

Usunąć obecne implicit zachowania, w których każdy ukończony quest automatycznie daje relation i EXP niezależnie od jego charakteru.

Nie budować ogólnego quest scripting engine ani systemu arbitrary conditions.

## Docelowy model

Rozdzielić następujące koncepty:

```text
Quest
├── Identity
├── Availability
├── Stages / Objectives
└── Outcomes
    ├── Outcome A
    │   ├── reward
    │   └── consequences
    ├── Outcome B
    │   ├── reward
    │   └── consequences
    └── Outcome C
        ├── reward
        └── consequences
```

Kluczowy kontrakt:

> Ukończenie objective nie musi być równoznaczne z rozwiązaniem questa.

Quest może prowadzić do kilku możliwych resolution paths.

## 1. Quest identity

Rozszerzyć `QuestDef` o obowiązkowe:

```ts
title: string
description: string
```

### `title`

Krótka nazwa questa widoczna w Quest Log.

### `description`

Opisuje ogólny kontekst questa i jego cel.

Nie zastępuje `QuestStage.description`.

Rozdział odpowiedzialności:

```text
QuestDef.description
= ogólny kontekst questa

QuestStage.description
= aktualny krok / instrukcja
```

Nie generować tytułu automatycznie z `giverName`, objective ani `id`.

## 2. QuestOutcome

Wprowadzić jawny model outcome.

Nazwy:

```ts
type QuestOutcomeId = string
```

oraz:

```ts
type QuestOutcome = {
  id: QuestOutcomeId
  reward?: QuestReward
  consequences?: QuestConsequences
}
```

`QuestDef` posiada:

```ts
outcomes: QuestOutcome[]
```

Każdy quest musi mieć co najmniej jeden poprawny outcome.

Dla prostych liniowych questów nadal istnieje tylko jeden outcome, np.:

```ts
outcomes: [
  {
    id: 'completed',
    ...
  }
]
```

Nie tworzyć osobnego modelu „simple quest”.

## 3. Runtime resolution

Quest runtime musi zapamiętać nie tylko terminal state, ale także sposób zakończenia.

Dodać:

```ts
resolvedOutcomeId?: QuestOutcomeId
```

do progress/runtime state oraz persistence.

Przykład:

```text
state = complete
resolvedOutcomeId = returned_to_owner
```

lub:

```text
state = failed
resolvedOutcomeId = sheep_died
```

Outcome może dotyczyć zarówno pozytywnego, jak i negatywnego zakończenia.

Nie zakładać:

```text
outcome == successful completion
```

Outcome opisuje sposób resolution.

## 4. Resolve zamiast jednego generic completion

Obecny lifecycle oparty wyłącznie na `completeQuest()` rozszerzyć o jawne rozwiązanie questa poprzez outcome.

Docelowy kontrakt:

```ts
resolveQuest(questId, outcomeId)
```

Dokładna wewnętrzna sygnatura może uwzględniać istniejący lifecycle, ale semantyka musi pozostać jawna:

```text
quest
+
selected outcome
→ terminal state
→ reward
→ consequences
→ history/persistence
```

Nie wybierać outcome automatycznie przez skanowanie całego world state.

Nie tworzyć:

```ts
evaluateAllPossibleOutcomes()
```

ani declarative expression engine.

Outcome wybiera konkretna logika questa lub interaction path.

## 5. Outcome terminal state

`QuestOutcome` musi jawnie określać terminal state:

```ts
type QuestOutcome = {
  id: QuestOutcomeId
  state: 'complete' | 'failed'
  reward?: QuestReward
  consequences?: QuestConsequences
}
```

Nie używać `invalidated` jako normalnego outcome.

`invalidated` pozostaje lifecycle state dla sytuacji, w których quest nie może być dalej kontynuowany z przyczyn technicznych/world continuity, np. utrata niestabilnego targetu po rebuildzie.

`failed` oznacza rzeczywisty wynik wydarzeń w świecie lub decyzji gracza.

## 6. QuestReward

Oddzielić nagrodę od consequences.

Wprowadzić:

```ts
type QuestReward = {
  visibility: 'shown' | 'hidden'
  items?: Array<{
    kind: ItemKind
    count: number
  }>
}
```

Coins pozostają zwykłym `ItemKind = 'coin'`.

Nie tworzyć osobnego wallet/currency system.

### Multiple reward items

Reward musi od razu wspierać wiele pozycji.

Nie zachowywać ograniczenia:

```ts
reward: {
  kind
  count
}
```

Przykład:

```ts
reward: {
  visibility: 'shown',
  items: [
    { kind: 'coin', count: 15 },
    { kind: 'bread', count: 2 }
  ]
}
```

### Visibility

`shown` oznacza, że Quest UI może prezentować obiecaną nagrodę przed resolution.

`hidden` oznacza, że nagroda nie jest wcześniej ujawniana.

Nie wyświetlać hidden reward jako `???` ani podobnego placeholdera, chyba że UI już posiada taki pattern.

## 7. Rewards vs consequences

Przyjąć twarde rozróżnienie.

### Reward

To coś przekazanego bezpośrednio graczowi jako wynagrodzenie:

```text
coins
items
```

### Consequence

To zmiana stanu świata/społeczności wynikająca z resolution:

```text
relation
reputation
renown
world state
ownership
access
future quest availability
etc.
```

Nie nazywać relation/reputation/renown „reward”.

Nie mieszać tych konceptów w jednym `effects` bag.

## 8. QuestConsequences

W tym planie wprowadzić jawny minimalny model consequences obejmujący tylko już istniejące i potrzebne systemy.

Nazwy:

```ts
type QuestConsequences = {
  relations?: Array<{
    npcName: string
    delta: number
  }>
  social?: QuestSocialConsequence
}
```

gdzie `QuestSocialConsequence` wykorzystuje seam z `quests-progression-001`.

Nie budować jeszcze uniwersalnego:

```ts
effects: Record<string, unknown>
```

ani registry dowolnych commandów.

### Relation

Relation jest explicit.

Nie istnieje domyślny:

```text
+1 relation
```

za ukończenie questa.

Personal quest może mieć relation consequence.

Formalne zlecenie może nie mieć żadnej.

Nie zwiększać automatycznie relation z giverem ani target NPC tylko dlatego, że NPC występował w objective.

## 9. Reputation i renown

Po `quests-progression-001` social consequences korzystają z istniejącego seam:

```ts
applySocialConsequence(...)
```

Outcome może jawnie uruchomić social consequence przypisane do odpowiedniego settlementu.

Nie przenosić ownership reputation/renown do QuestManager.

Nie duplikować logiki `ReputationManager`.

## 10. EXP

Usunąć obecny globalny quest EXP.

Recon wykazał, że EXP:

- jest naliczany,
- jest persisted,
- jest wyświetlany,
- nie posiada gameplay consumera,
- nie wpływa na level, attributes, skills, unlocks ani decyzje.

Usunąć:

- `QuestManager.exp`,
- `getExp()`,
- default EXP,
- custom quest EXP effects,
- quest EXP persistence,
- EXP z HUD/Quest Log,
- związane tests i fixtures.

Nie zastępować go nowym progression systemem w tym planie.

Jeżeli progression zostanie zaprojektowane później, powinno wynikać z realnych mechanik, np. skills/attributes, a nie z zachowania starego licznika bez konsumenta.

## 11. Existing quest migration

Przenieść wszystkie istniejące questy na nowy model bez zmiany ich objective semantics, chyba że plan jawnie wskazuje rebalans.

Każdy obecny liniowy quest otrzymuje pojedynczy outcome.

### `relay-anna-piotr`

Personal/social quest.

- jeden successful outcome,
- relation consequence może pozostać, jeśli odpowiada charakterowi questa,
- brak EXP.

### `shells-dla-kasi`

Personal fetch quest.

- jeden successful outcome,
- mała explicit relation consequence, jeśli obecny charakter dialogu ją uzasadnia,
- brak EXP.

### `woda-dla-marka`

Usunąć nieproporcjonalny reward:

```text
long_sword
```

Zastąpić małą nagrodą odpowiednią do prostej przysługi.

Ustalić:

```text
5 coins
```

Reward:

```text
visibility: shown
```

Relation:

```text
Marek +1
```

Nie przyznawać miecza.

### `zwiadowca`

Zachować wieloetapową strukturę.

Jeden successful outcome.

Nagroda może pozostać ukryta lub nie istnieć; nie dodawać na siłę pieniędzy.

Jeżeli quest ma charakter osobistego zaufania, relation consequence musi być explicit.

### `zagubiona-owca`

Na tym etapie zachować istniejące standardowe rozwiązanie:

```text
returned_to_owner
```

Reward:

```text
10 coins
```

Jednocześnie użyć tego questa jako pierwszego testowego przykładu wielu outcomes, jeżeli obecna logika pozwala to zrobić bez dodawania nowej mechaniki ownership.

Dodać:

```text
sheep_died
```

jako failed outcome.

Nie dodawać jeszcze:

```text
kept_for_yourself
```

jeżeli nie istnieje właściwy domain mechanism przejęcia zwierzęcia.

To ważne: model ma wspierać taki outcome, ale plan nie powinien implementować fikcyjnego livestock ownership tylko dla questa.

### `drewno-na-naprawe`

Zachować 15 coins, jeśli po rebalansie nadal jest sensowne względem pracy wymaganej przez quest.

Formalny charakter zlecenia nie powinien automatycznie zwiększać relation.

### `grozny-wilk`

Zachować significant reward i social consequences z `quests-progression-001`.

Przenieść je do odpowiedniego outcome.

Nie zmieniać social values ustalonych w `001`.

### `wilcza-jama`

Analogicznie przenieść reward i social consequences do outcome.

Nie zmieniać social values ustalonych w `001`.

### Landmark quests

Przenieść istniejące contextual landmark quests do jednego-outcome modelu.

Nie zmieniać ich world binding.

## 12. Multi-outcome foundation

System musi umożliwiać questy typu:

```text
Znajdź sprawcę
├── oddaj go straży
├── pozwól mu odejść
└── przyjmij łapówkę
```

Każdy outcome może posiadać inne:

```text
terminal state
reward
relation consequences
reputation consequences
renown consequences
```

Nie trzeba dodawać takiego nowego questa w tym planie.

Wystarczy, że architektura i tests dowodzą, iż co najmniej jeden quest może mieć dwa terminal outcomes.

## 13. Objective completion vs resolution

Nie każdy objective powinien automatycznie wołać:

```ts
resolveQuest(..., 'completed')
```

System powinien rozróżnić:

```text
objective satisfied
```

od:

```text
quest resolved
```

Dla prostych questów ostatni objective może prowadzić bezpośrednio do resolution.

Dla RPG questu ukończenie objective może otworzyć interaction/dialogue choice prowadzącą dopiero do konkretnego outcome.

Nie budować w tym planie rozbudowanego dialogue-choice engine.

## 14. Quest Log

Rozszerzyć DTO i Quest Log tak, aby wyświetlał:

- `title`,
- `description`,
- giver,
- state,
- current stage/objective,
- stage progress,
- promised reward, jeśli outcome/reward jest znany i `visibility = shown`.

Nie wyświetlać globalnego EXP.

### Multiple outcomes i reward preview

Quest Log nie powinien zgadywać finalnej nagrody, jeśli zależy ona od jeszcze niewybranego outcome.

Jeżeli wszystkie dostępne successful outcomes mają tę samą `shown` reward, można ją pokazać jako obiecaną.

Jeżeli rewards zależą od wyboru/rozwiązania i nie ma jednej jednoznacznej obietnicy, UI nie pokazuje jednego arbitralnego reward preview.

Nie budować teraz pełnego „possible outcomes preview”.

## 15. Quest history / completed display

Po resolution Quest Log powinien mieć dostęp do:

```ts
resolvedOutcomeId
```

Nie musi jeszcze pokazywać technicznego ID.

Jeżeli outcome ma presentation text, można dodać:

```ts
resultText?: string
```

do `QuestOutcome`.

`resultText` opisuje wynik po fakcie, np.:

```text
Owca wróciła do właścicielki.
```

lub:

```text
Owca zginęła przed powrotem.
```

Nie używać `resultText` do sterowania gameplay logic.

## 16. Persistence

Rozszerzyć quest progress persistence o:

```ts
resolvedOutcomeId?: QuestOutcomeId
```

Starsze save'y:

- aktywne questy zachowują dotychczasowy progress,
- ukończone legacy questy bez outcome muszą dostać deterministyczny default outcome odpowiadający ich poprzedniemu jedynemu zakończeniu,
- failed legacy quests analogicznie zachowują terminal state,
- invalidated pozostaje invalidated.

Nie resetować starych ukończonych questów tylko dlatego, że wcześniej nie zapisywały outcome.

Usunąć `quests.exp` z nowego SaveData contract.

Backward compatibility validator/restore powinien tolerować starsze save'y zawierające `quests.exp`, ale po nowym zapisie pole nie jest już wymagane ani emitowane.

## 17. Availability

Nie przebudowywać obecnego `QuestAvailability` poza zmianami koniecznymi do typów.

Relation-based availability pozostaje.

Nie dodawać jeszcze:

- reputation gates,
- renown gates,
- quest prerequisites,
- quest chain graph,
- settlement conditions,
- arbitrary predicates.

Te rzeczy mogą użyć outcome/history później.

## 18. Quest chains

Nie implementować pełnego systemu quest chains.

`resolvedOutcomeId` przygotowuje naturalny fundament pod przyszłe warunki typu:

```text
quest A resolved as outcome X
→ quest B becomes available
```

ale nie dodawać teraz graph managera ani chain DSL.

## 19. Rewards poza items/coins

Architektura outcomes musi pozwalać w przyszłości na:

- land ownership,
- horse/mount,
- helper/follower,
- access,
- house/property.

Nie implementować ich teraz w `QuestReward`.

Nie dodawać placeholderów typu:

```ts
reward.kind = 'land'
```

jeśli nie istnieje poprawny domain ownership mechanism.

Takie efekty powinny później działać przez domain-specific consequences.

## 20. Tests — outcomes

Dodać tests obejmujące:

- quest z jednym outcome,
- quest z co najmniej dwoma outcomes,
- poprawne zapisanie `resolvedOutcomeId`,
- niemożność zastosowania dwóch terminal outcomes do tego samego resolution,
- reward tylko wybranego outcome,
- consequences tylko wybranego outcome,
- complete outcome,
- failed outcome,
- invalidated niezależne od normalnych outcomes,
- brak double reward/double consequence.

## 21. Tests — rewards

Sprawdzić:

- single item reward,
- multiple item rewards,
- coin reward,
- hidden reward,
- shown reward,
- brak reward,
- inventory overflow korzysta z istniejącego shared `grantItem` path,
- brak osobnego quest inventory/currency path.

## 22. Tests — relation

Sprawdzić:

- quest bez relation consequence nie zmienia relation,
- personal quest z explicit consequence zmienia wskazaną relation,
- formal work quest może zakończyć się bez relation change,
- target NPC nie otrzymuje już automatycznej relation tylko dlatego, że występował w objective,
- consequence stosuje się dokładnie raz.

## 23. Tests — EXP removal

Usunąć lub poprawić tests oczekujące:

- default EXP,
- custom EXP,
- EXP persistence,
- EXP reset,
- EXP UI.

Potwierdzić, że quest completion nie posiada już ukrytego progression side effect.

## 24. Tests — migration

Sprawdzić stare save'y zawierające:

```text
quests.exp
completed quest without resolvedOutcomeId
failed quest without resolvedOutcomeId
```

Restore nie może powodować utraty valid quest progress/history.

## 25. Dokumentacja

Po implementacji zaktualizować canonical state docs, przede wszystkim tam, gdzie opisują:

- QuestDef,
- quest lifecycle,
- rewards,
- relation,
- EXP,
- persistence,
- Quest Log.

Sprawdzić co najmniej:

```text
docs/state/player-systems.md
docs/state/npc.md
docs/state/persistence.md
docs/vision/quests.md
```

`docs/vision/quests.md` powinien jasno zachować trzy równorzędne źródła questów:

```text
authored RPG
contextual
emergent/world-driven
```

Nie opisywać authored quests jako gorszego lub tymczasowego wariantu.

Sprawdzić również stary:

```text
docs/plans/2026-08-13--093--quests-v3-world-problems-reputation.md
```

i usunąć/sprostować stale claims, szczególnie te dotyczące landmark support oraz kierunku reputation, jeśli nadal są prezentowane jako aktualny kontrakt.

Dodać implementation notes zgodnie z `docs/plans/PLANNING.md`.

## Non-goals

Plan nie obejmuje:

- nowych rozbudowanych questów RPG,
- dialogue choice engine,
- generic condition/expression engine,
- quest scripting language,
- osobnego JobManager,
- osobnego systemu contracts,
- reputation-based availability,
- quest chains graph,
- settlement/world problem generator,
- witness/gossip system,
- land/house/mount/helper rewards,
- skill progression,
- replacement for removed EXP,
- global morality,
- procedural reward generation,
- reward economy balancing całej gry.

## Architektura po wdrożeniu

```text
QuestDef
├── identity
│   ├── title
│   └── description
├── availability
├── stages/objectives
└── outcomes
    ├── id
    ├── terminal state
    ├── result text
    ├── reward
    └── consequences
        ├── relations
        └── social

QuestProgress
├── state
├── stage
└── resolvedOutcomeId

QuestManager
├── progress/lifecycle ownership
├── objective handling
├── outcome resolution
├── reward dispatch
└── consequence dispatch
```

External ownership pozostaje poza `QuestManager`:

```text
Inventory / items
← reward grant

QuestManager relation state
← relation consequences

ReputationManager
← social consequences

future domain owners
← future domain-specific consequences
```

## Kolejność implementacji

1. Dodać `title` i `description` do `QuestDef`.
2. Dodać `QuestOutcomeId`, `QuestOutcome`, `QuestReward`, `QuestConsequences`.
3. Rozszerzyć quest progress o `resolvedOutcomeId`.
4. Wprowadzić jawny `resolveQuest(questId, outcomeId)` lifecycle.
5. Oddzielić reward application od consequence application.
6. Usunąć implicit relation rewards.
7. Usunąć quest EXP z managera, persistence i UI.
8. Przenieść istniejące questy na outcomes.
9. Wprowadzić `returned_to_owner` / `sheep_died` jako realny multi-outcome przykład dla `zagubiona-owca`, bez tworzenia nieistniejącego livestock ownership.
10. Rebalance `woda-dla-marka`: usunąć `long_sword`, ustawić `5 coins`, shown reward i explicit Marek relation +1.
11. Przenieść social consequences `grozny-wilk` / `wilcza-jama` z `001` do odpowiednich outcomes bez zmiany wartości.
12. Rozszerzyć Quest Log o identity i reward visibility.
13. Dodać backward-compatible persistence migration/normalization.
14. Zaktualizować tests.
15. Zaktualizować canonical docs i stale plan 093.
16. Dodać implementation notes.

## Verification

### Automated

Uruchomić odpowiednie testy oraz standardowe repo checks, w szczególności:

- QuestManager lifecycle tests,
- outcome tests,
- reward tests,
- relation consequence tests,
- reputation/social consequence integration tests,
- persistence validation/migration tests,
- Quest Log/component tests, jeśli istnieją,
- typecheck,
- build.

Nie uruchamiać `pnpm docs:sync` ręcznie — synchronizacja dokumentacji odbywa się przez GitHub workflow.

### Manual — User

User sprawdza w przeglądarce:

1. Quest Log pokazuje title i description.
2. Nie pokazuje już globalnego EXP.
3. Quest ze `shown` reward pokazuje obiecaną nagrodę.
4. Hidden reward nie jest ujawniany przed resolution.
5. `woda-dla-marka` daje 5 coins zamiast miecza.
6. Prosty formalny quest bez relation consequence nie zwiększa automatycznie relacji.
7. Personal quest z explicit relation consequence nadal ją zwiększa.
8. `zagubiona-owca` poprawnie zapisuje różny outcome dla zwrotu owcy i jej śmierci.
9. Reward/consequences są stosowane tylko raz.
10. `grozny-wilk` i `wilcza-jama` zachowują reputation/renown consequences z planu `quests-progression-001`.
11. Save/load zachowuje `resolvedOutcomeId`.
12. Starszy save bez outcome metadata nadal ładuje ukończone/failed questy poprawnie.
13. Inventory overflow dla quest reward nadal korzysta ze wspólnego mechanizmu.
14. Existing landmark i animal-target quests nie mają regresji.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
