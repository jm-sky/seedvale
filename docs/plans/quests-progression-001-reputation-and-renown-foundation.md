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

Zachować rozdzielne koncepty:

```text
Relation      = co konkretny NPC myśli o graczu
Reputation    = jak społeczność ocenia społeczne cechy gracza
Renown        = jak szeroko gracz jest znany w tej społeczności
Quest outcome = co faktycznie stało się z konkretnym questem
Reward        = co zostało graczowi bezpośrednio przekazane jako zapłata/nagroda
Known for     = konkretne trwałe fakty o czynach gracza (badges/history)
```

### Relation

Relation pozostaje obecnym per-NPC stanem zarządzanym przez `QuestManager`. Nie przenosić go do nowego systemu w tym planie. Pozostaje silniejszym sygnałem w interakcjach osobistych niż publiczna rozpoznawalność.

Relation może zmienić się po zdarzeniu, o którym wie tylko konkretny NPC, bez zmiany settlement reputation. Przykład: prywatna przysługa lub konflikt z jedną osobą.

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

### Quest outcome i reward

Quest outcome nie jest reputation eventem sam z siebie. Outcome opisuje rzeczywisty rezultat konkretnej sytuacji; dopiero jawna social consequence może przełożyć społecznie znany rezultat na relation/reputation/renown.

Reward jest bezpośrednią korzyścią przekazaną graczowi, np. item/coins. Nie nazywać zmian relation/reputation/renown rewardem i nie wyprowadzać social standing z wartości nagrody.

Pełna przebudowa outcome/reward należy do `quests-progression-002`; ten plan definiuje wyłącznie granicę semantyczną, której `002` nie powinien później zacierać.

## Canonical social-knowledge semantics

Reputation nie oznacza „co system wie o graczu”, tylko utrwaloną lokalną opinię społeczną. Żeby zdarzenie mogło wpłynąć na reputation/renown, integracja musi znać co najmniej:

```text
actor        = kto wykonał działanie
subject      = kogo/czego działanie dotyczyło
settlementId = której społeczności dotyczy wiedza
knowledge    = dlaczego społeczność może o zdarzeniu wiedzieć
impact       = jakie dimensions/renown zmienia społecznie znany rezultat
```

`knowledge` jest wymogiem semantycznym, nie nowym subsystemem Stage 1. Stage 1 dopuszcza jawne źródła typu:

```text
reported        = rezultat został świadomie zgłoszony odpowiedniej osobie/społeczności
public_result   = rezultat sam w sobie jest lokalnie jawny i integracja może to zagwarantować
explicit_social = konkretny call site posiada już wystarczający kontekst, by uznać zdarzenie za znane
```

Nie wolno stosować:

```text
game/system knows it happened
→ therefore settlement knows it happened
```

Brak informacji o wiedzy społecznej oznacza brak zmiany reputation/renown.

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

## 5. Reputation event taxonomy

Reputation nie posiada własnego równoległego katalogu „player events”. Katalog poniżej klasyfikuje zdarzenia, które istnieją już w domenach świata albo naturalnie wynikają z ich prawdziwych mutacji.

| Kategoria | Przykładowe źródła świata | Typowy social meaning | Warunek wiedzy |
|---|---|---|---|
| `personal_assistance` | pomoc konkretnemu NPC, przekazanie wiadomości, drobna przysługa | głównie relation; czasem małe `benevolence`/`trust` | odbiorca wie; settlement tylko jeśli rezultat staje się społecznie znany |
| `household_assistance` | odzyskanie zwierzęcia, dostarczenie brakującego dobra, pomoc rodzinie | `benevolence`, czasem `trust`/`competence` | household zna rezultat; settlement effect wymaga szerszej wiedzy |
| `settlement_service` | usunięcie realnego lokalnego problemu, rozwiązanie niedoboru lub zadania dla społeczności | `competence`, `benevolence`, czasem `trust` | rezultat musi być publiczny/raportowany osadzie |
| `threat_response` | pokonanie groźnego zwierzęcia, obrona przed zagrożeniem | `courage`, `competence`, czasem `benevolence`; zwykle renown | znany rezultat zagrożenia; sam combat event nie wystarcza |
| `harm_or_aggression` | atak na mieszkańca, zabicie NPC, napaść | ujemne `integrity`, `trust`, często dodatni renown | tylko gdy istnieje świadek/raport/publiczny skutek; Stage 1 nie dodaje detekcji |
| `theft_or_property_violation` | przyszła kradzież z realnego inventory/container/ownership | ujemne `integrity`/`trust` | właściciel lub społeczność musi wiedzieć; brak crime-by-omniscience |
| `agreement_reliability` | dotrzymanie lub złamanie jawnej obietnicy/zlecenia | `trust`, czasem `integrity` | strony umowy znają wynik; settlement scope tylko przy społecznej wadze |
| `economic_conduct` | uczciwe/nieuczciwe zachowanie w realnym trade/work/payment flow | `integrity`, `trust`, czasem `competence` | event musi pochodzić z domeny trade/economy/work, nie z heurystyki reputation |
| `quest_resolution` | rezultat questa oparty na realnym world state | zależy od znaczenia outcome; brak defaultu | quest/integration jawnie deklaruje social consequence i podstawę wiedzy |
| `public_local_event` | szeroko widoczny lub oficjalnie ogłoszony lokalny czyn | odpowiednie dimensions + wyższy renown | integracja gwarantuje lokalną publiczność |
| `private_or_unknown_event` | naruszenie grobu bez świadków, prywatna walka poza wiedzą osady | brak settlement reputation/renown | brak wiedzy = brak efektu |

`HouseholdHistoryEvent`, `SettlementHistoryEvent`, combat state i podobne logi/history są obserwacją domenowych mutacji, nie automatycznym źródłem wiedzy społecznej. Nie skanować ich retrospektywnie w celu „wykrywania” reputacji.

## 6. Magnitude semantics

Nie authorować przypadkowych wartości per quest bez wspólnej semantyki. Przyjąć kategorie magnitude dla pojedynczego społecznie znanego zdarzenia:

| Kategoria | Reputation delta — orientacyjnie | Renown delta — orientacyjnie | Znaczenie |
|---|---:|---:|---|
| `trace` | `1–2` | `0–1` | ledwo zauważalny sygnał; zwykle nie dla zwykłych questów |
| `minor` | `3–5` | `1–3` | mała, konkretna przysługa lub lokalny incydent |
| `meaningful` | `6–10` | `3–8` | wyraźny rezultat dla household/grupy lub ważna decyzja |
| `major` | `11–18` | `8–18` | istotny czyn wpływający na bezpieczeństwo lub dobro osady |
| `exceptional` | `19–30` | `18–35` | rzadkie wydarzenie definiujące lokalną historię |

Zasady:

- kategoria opisuje wagę zdarzenia, nie automatyczny równy delta dla wszystkich dimensions,
- jedno zdarzenie może mieć np. `major courage`, `meaningful competence`, `minor benevolence`,
- ujemne zdarzenia używają tej samej skali magnitude ze znakiem ujemnym,
- renown zależy bardziej od zasięgu/publiczności niż od moralnej wartości czynu,
- nie sumować automatycznie liczby świadków × delta,
- nie przeliczać wartości coins/items na reputation,
- powtarzalna drobna czynność nie powinna pozwalać bez ograniczeń farmić `major` standing; każde źródło musi reprezentować realne, znaczące wydarzenie lub wyraźny milestone.

Pierwsze dwa questy są kalibracją tej skali:

### `grozny-wilk`

```text
renown       +15   major/public local event
competence   +10   meaningful
courage      +12   major
benevolence   +4   minor
```

### `wilcza-jama`

```text
renown       +25   exceptional local visibility
competence   +15   major
courage      +18   major/high
benevolence   +6   meaningful
```

Nie zmieniają `trust` ani `integrity`.

Nie każdy quest daje reputation/renown i nie istnieją default social effects.

## 7. Impact matrix

Poniższa macierz jest kontraktem semantycznym, nie listą wszystkiego, co Stage 1 ma implementować.

| Działanie / rezultat | Źródło informacji | Kto może wiedzieć | Scope social state | Typowy renown | Czy wymaga knowledge? |
|---|---|---|---|---|---|
| prywatna pomoc NPC | NPC będący odbiorcą | ten NPC | relation; settlement zwykle bez zmian | `0` | tak — relation ma naturalnego odbiorcę, settlement nie |
| pomoc household przy realnym problemie | członek household / quest report / publiczny rezultat | household, czasem osada | relation + ewentualnie settlement reputation | `0–minor` | tak |
| usunięcie lokalnego zagrożenia i raport do osady | giver / reprezentant osady + rezultat world state | osada | settlement reputation + renown | `major` | tak; report/public result daje podstawę |
| pokonanie zagrożenia samotnie, bez świadków i raportu | combat/world state | tylko system | brak | `0` | tak; brak wiedzy blokuje efekt |
| napaść na NPC przy świadkach | combat integration + przyszły witness/report seam | świadkowie, potencjalnie osada | relation of victim + settlement negative reputation | `minor–major` zależnie od skutku | tak; Stage 1 nie implementuje witness detection |
| napaść na NPC bez świadków | combat state | gracz/target, lecz brak społecznej wiedzy | osobista relation tylko jeśli właściwy system ją zmienia; brak settlement effect | `0` | tak |
| kradzież z household bez wykrycia | inventory/ownership domain | system, nie społeczność | brak settlement effect | `0` | tak |
| wykryta kradzież / jawne naruszenie własności | ownership/inventory + przyszły detection/report seam | właściciel/household/osada | ujemne `integrity`/`trust`, renown może wzrosnąć | `minor–major` | tak |
| quest success: mała prywatna przysługa | quest resolution | giver/target | relation; social consequence tylko jeśli authored | `0–minor` | tak |
| quest success: problem całej osady | quest resolution + real world result | osada | reputation + renown | `meaningful–exceptional` | tak |
| quest failure znany tylko giverowi | quest resolution | giver | relation / future quest outcome; zwykle brak reputation | `0` | tak |
| publiczna kompromitująca porażka | real outcome + jawna publiczność | osada | odpowiednie ujemne dimension; renown może wzrosnąć | `minor–major` | tak |
| legalny handel po zwykłych cenach | trade domain | strony transakcji | brak default social effect | `0` | tak; zwykły trade nie jest reputacyjnym eventem |
| znacząca pomoc przy settlement shortage | economy/household domain + jawny result/milestone | beneficjenci/osada | `benevolence`/`competence`, czasem renown | `minor–meaningful` | tak |
| naruszenie grobu bez społecznej wiedzy | grave/badge event | system | badge/history tylko; brak reputation | `0` | tak |

## 8. Concrete scenarios

### Pomoc konkretnemu NPC

Gracz przynosi Markowi wodę. Marek zna rezultat, więc może wzrosnąć personal relation. Sama przysługa nie oznacza automatycznie, że cała osada uznaje gracza za bardziej życzliwego lub kompetentnego. Jeśli późniejszy authored outcome jawnie uczyni tę przysługę publiczną, może dodać mały local effect.

### Pomoc household

Gracz odnajduje zagubioną owcę konkretnej rodziny. Household ma naturalną podstawę wiedzy. Settlement reputation może zmienić się tylko wtedy, gdy integracja uzna rezultat za społecznie istotny/znany; typowo byłoby to `minor/meaningful benevolence` i najwyżej małe renown, a nie automatyczny bonus dlatego, że objective zakończyło się sukcesem.

### Pomoc całej osadzie / zagrożenie

`grozny-wilk` i `wilcza-jama` dotyczą bezpieczeństwa osady, a rezultat jest raportowany. To uzasadnia `competence`, `courage`, `benevolence` i duży renown. Samo `animal_died` w combat/fauna nie może jednak naliczać reputation; social consequence powstaje dopiero z kontekstu rozwiązanego lokalnego problemu.

### Kradzież lub naruszenie własności

Przyszła kradzież musi pochodzić z realnego inventory/container/ownership eventu. Reputation system nie skanuje inventory gracza ani braków householdu. Bez wykrycia nie ma social effect. Przy wykryciu naturalny kierunek to ujemne `integrity` i `trust`; publiczne lub poważne zdarzenie może dodatkowo podnieść renown.

### Agresja

Combat odpowiada za realne obrażenia/śmierć, nie za wiedzę społeczną. Atak na NPC może obniżyć osobistą relation ofiary, jeśli właściwy social integration to definiuje. Settlement reputation wymaga oddzielnego faktu, że zdarzenie stało się znane. Nie dodawać w tym planie witness systemu tylko po to, aby agresja miała reputation consequence.

### Quest success/failure

Quest resolution ma reprezentować rzeczywisty rezultat. Success nie ma default social effect, a failure nie ma default penalty. Social consequence zależy od znaczenia outcome i wiedzy o nim. `quests-progression-002` może później opisać różne outcomes, ale nie powinien zmieniać tej zasady.

### Wydarzenie lokalne vs szeroko znane

Dwie identyczne czynności mogą mieć inny renown:

```text
pomoc jednej rodzinie po cichu
→ meaningful benevolence dla społecznie znanego household eventu
→ renown mały lub 0

uratowanie osady podczas jawnego zagrożenia
→ podobny kierunek reputation
→ renown duży, bo zdarzenie ma szeroki local audience
```

Renown nie jest więc „sumą pozytywnych punktów reputation”; mierzy zasięg rozpoznawalności.

## 9. Integration contract

Reputation system jest konsumentem jawnych social consequences. Nie jest detektorem świata.

### Co powinny emitować / dostarczać domeny świata

Gdy domena ma prawdziwy, semantyczny moment zakończenia zdarzenia i posiada wystarczającą wiedzę społeczną, integracja może dostarczyć:

```ts
type SocialConsequence = {
  settlementId: string
  reputation?: Partial<Record<ReputationDimension, number>>
  renown?: number
}
```

`SocialConsequence` opisuje już rozstrzygnięty społeczny skutek, nie surowy event do klasyfikacji przez `ReputationManager`.

Naturalne emitery/call sites:

- quest resolution — gdy authored outcome/result jest społecznie znany,
- household/settlement problem resolution — gdy właściciel domeny potrafi wskazać realny milestone i społeczny scope,
- combat/crime/ownership — dopiero gdy przyszły system detection/reporting ustali wiedzę,
- economy/work/trade — tylko dla znaczących rezultatów, nie dla każdej mutacji stocku/transakcji.

### Czego ReputationManager nie powinien robić

Nie powinien:

- skanować NPC/households/settlement economy,
- analizować `SettlementHistoryEvent` / `HouseholdHistoryEvent` / debug history,
- subskrybować wszystkich combat hit/death events,
- zgadywać settlement scope z pozycji gracza po fakcie,
- rozwiązywać identity po display name,
- wykrywać „czy quest był ważny” na podstawie reward/EXP,
- wyliczać social impact z ceny przedmiotu, obrażeń lub liczby zabitych przeciwników,
- implementować witness/gossip/information propagation,
- deduplikować surowych wydarzeń z wielu domen.

Właściciel konkretnego zdarzenia odpowiada za dokładnie-jednorazowe wywołanie social consequence w momencie, gdy wynik jest finalny i podstawa wiedzy istnieje. `ReputationManager` tylko aplikuje jawne delty do wskazanego `settlementId`.

## 10. Trwały seam dla quest consequences

Nie importować `ReputationManager` bezpośrednio do `QuestManager`.

Rozszerzyć dependency injection `QuestManager` o narrow callback nazwany:

```ts
applySocialConsequence(consequence)
```

Konsekwencja ma wskazywać `settlementId` oraz jawne delty reputation/renown potrzebne do wykonania danego questa. `QuestManager` decyduje, kiedy completion nastąpiło dokładnie raz; aplikacja/composition root mapuje consequence na `ReputationManager`.

Nie budować w tym planie ogólnego effects engine ani event busa. Ten seam ma pozwolić kolejnemu planowi quest foundations rozwinąć consequences bez sprzęgania questów z właścicielem reputation.

## 11. Reputation dimensions bez sztucznych consumerów

Nie dodawać reguł tylko po to, aby każdy wymiar był już używany.

Przyszłe naturalne zastosowania mogą obejmować:

```text
trust + integrity   → powierzanie wartości / odpowiedzialności
competence          → praca / ważne zadania
competence+courage  → zagrożenia
benevolence         → społeczne prośby
```

Są poza scope tego planu.

## 12. Relation pozostaje personal signal

Nie zmieniać ownership relation ani istniejących relation gates.

System musi reprezentować bez konfliktu np.:

```text
NPC dislikes player personally
+
settlement considers player highly competent
```

Nie zmieniać lodging/access rules tylko dlatego, że reputation jest teraz dostępna.

## 13. BadgeManager i stary pseudo-standing

`BadgeManager` pozostaje właścicielem earned badges i counters potrzebnych do ich odblokowania.

Usunąć `communityOffensePenalty()` oraz logikę łączenia jej z `QuestManager.getPlayerStanding()`.

Zachować `grave_robber`, `desecrator` i ich counters.

Naruszenie grobu nie zmienia jeszcze `integrity`, ponieważ obecnie nie ma mechanizmu świadków ani społecznego poznania zdarzenia. Symulacja nie może zmieniać settlement reputation tylko dlatego, że sama zna prywatny czyn gracza.

Badge sam z siebie nie modyfikuje reputation. Event, który doprowadził do badge'a, może kiedyś niezależnie wywołać social consequence, jeśli stał się społecznie znany.

## 14. Character Screen

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

## 15. Zasada wiedzy społecznej

Kontrakt systemu:

> Reputation lub renown zmieniają się tylko wtedy, gdy konkretna integracja ma podstawę uznać, że czyn stał się społecznie znany.

Stage 1 nie implementuje witness detection, gossip, NPC-to-NPC information propagation, cross-settlement propagation, regional reputation ani global renown.

Na tym etapie odpowiedzialność za poprawność social consequence leży po stronie jawnego call site.

Nie budować centralnego `ReputationEventProcessor` ani nowego event busa. Inne domeny mogą korzystać bezpośrednio z narrow composition-root integration z `ReputationManager` odpowiedniej dla danego systemu.

## 16. Brak decay i propagacji

Stage 1 nie implementuje:

- reputation decay,
- renown decay,
- cross-settlement propagation,
- regional reputation,
- world reputation,
- global fame.

Każdy settlement ma niezależny stan.

API `changeRenown()` obsługuje dodatnią i ujemną deltę z clamp `0..100`, aby fundament nie kodował niepotrzebnego założenia „renown nigdy nie maleje”. Stage 1 nie dodaje jednak żadnego ujemnego source.

## 17. Testy ReputationManager

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

## 18. Reaction tests

Rozszerzyć tests `computeReactionChance`:

- renown wpływa na reaction chance,
- `renown = 0` zachowuje bazowe zachowanie,
- `renown = 100` daje maksymalnie około `+0.10`,
- relation nadal ma większy wpływ niż renown,
- reputation dimensions nie są automatycznie uśredniane do reaction chance.

## 19. Quest social-consequence tests

Dodać testy potwierdzające dokładne delty `grozny-wilk` i `wilcza-jama`.

Sprawdzić:

- consequence jest zastosowana dokładnie raz,
- failed/incomplete quest nie daje consequence,
- `trust` i `integrity` pozostają bez zmian,
- reward item/EXP/relation zachowują swój obecny niezależny lifecycle.

Dodatkowo potwierdzić kontrakt wiedzy:

- samo `animal_died` nie aplikuje reputation,
- prywatny/grave-related event bez jawnej social consequence nie aplikuje reputation,
- consequence z poprawnym `settlementId` zmienia tylko wskazany settlement.

## 20. Persistence i social lookup tests

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

## 21. Badge tests

Usunąć tests `communityOffensePenalty()` i zachować badge progression tests.

Potwierdzić, że grave-related event bez jawnej social consequence nie zmienia reputation.

## 22. Dokumentacja i implementation notes

Po wdrożeniu zaktualizować canonical state docs tam, gdzie kontrakt social state/persistence stanie się nieaktualny. Sprawdzić co najmniej:

```text
docs/state/npc.md
docs/state/persistence.md
```

Implementation notes już istnieją. Nie kopiować do planu ich plików/symboli, lifecycle ownership, persistence wiring ani szczegółowej kolejności implementacyjnej. Przy implementacji zaktualizować notes tylko wtedy, gdy recon kodu ujawni nowe informacje, które realnie oszczędzą ponowny recon.

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
- dynamicznych consumerów wszystkich pięciu dimensions,
- retroaktywnego przetwarzania debug/domain history na social state,
- implementacji zakresu `quests-progression-002+`.

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

Social write path:

```text
real domain event/result
+ explicit knowledge basis
+ known settlement scope
→ domain/quest integration resolves SocialConsequence
→ ReputationManager applies deltas
```

Shared social read path:

```text
QuestManager relation ───────┐
                             ├→ PlayerSocialLookup → world/settlement → NpcAgent
ReputationManager ───────────┘
```

Każdy consumer wybiera tylko te sygnały społeczne, które mają znaczenie dla konkretnej decyzji.

## Kolejność implementacji

Szczegółowy code-level recon i kolejność są utrzymane w istniejących implementation notes. Na poziomie planu zachować tylko zależności logiczne:

1. authoritative reputation/renown state + persistence,
2. settlement-aware social read path,
3. real social consequence seam i dwa istniejące wolf quest sources,
4. usunięcie pseudo-standing/badge coupling,
5. Character Screen + tests/docs.

Nie rozszerzać tej kolejności o `quests-progression-002+`.

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