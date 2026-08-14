# Plan: Questy v3 — problemy świata, reputacja i questy kontekstowe

**Status:** `in progress` (Etap A–G zaimplementowane; Etap F zablokowane brakiem `landmarkId`/rejestru — patrz implementation notes §15; bandyci pozostają)  
**Created:** 2026-08-12  
**Priority:** 🔴 `high`  
**Effort:** XL

## Cel

Rozwinąć istniejący system questów v2 z prostych interakcji ze światem do questów wynikających z **problemów, zagrożeń i sytuacji istniejących w świecie Seedvale**.

Quest nie powinien być izolowanym zadaniem przypisanym graczowi.

Docelowy przepływ:

```text
świat / NPC / fauna / zasoby / landmark
                ↓
          problem / sytuacja
                ↓
        dostępny quest
                ↓
      działania gracza
                ↓
         zmiana świata
                ↓
    NPC / fauna / świat reagują
```

Drugim celem jest wykorzystanie istniejącej relacji z NPC jako podstawy do **reputacji i dostępu do questów**.

## Założenia

### 1. Quest wykorzystuje istniejące systemy

Nie tworzyć osobnych mechanizmów:

- walki,
- HP/death,
- zwierząt,
- landmarków,
- inventory,
- interakcji,
- dialogów.

Quest powinien obserwować stan tych systemów lub reagować na ich zdarzenia.

### 2. Relation → reputacja

Istniejący `relation/sympathy` z QuestManagera powinien zostać rozwinięty zamiast tworzenia osobnego `ReputationManager`.

Na tym etapie wystarczy prosty model poziomów:

```ts
type RelationLevel =
  | 'stranger'
  | 'acquainted'
  | 'friendly'
  | 'trusted'
```

Progi powinny być scentralizowane i łatwe do późniejszej zmiany.

### 3. Reputacja jest kontekstowa

Docelowo relacja może istnieć wobec:

```text
NPC
Village
Faction / group
```

W pierwszej implementacji należy jednak użyć istniejącego modelu relacji per NPC i nie budować jeszcze pełnego systemu frakcji.

Quest może wymagać np. minimalnego poziomu relacji z konkretnym NPC. Jeśli stabilna `VillageIdentity` już istnieje w codebase, można przygotować rozszerzenie pod reputację wioski, ale nie należy tworzyć równoległego systemu tylko na potrzeby tego planu.

---

# Zakres

## Faza 1 — Quest availability

Rozszerzyć `QuestDef` o opcjonalne warunki dostępności.

Przykładowo:

```ts
type QuestAvailability = {
  relation?: {
    npcId: string
    minimum: RelationLevel
  }
}
```

Quest może być:

```text
hidden / unavailable
        ↓
available
        ↓
offered
        ↓
active
        ↓
ready_to_report
        ↓
complete
```

Quest niespełniający warunków nie powinien być oferowany NPC.

Po osiągnięciu wymaganego poziomu relacji powinien stać się dostępny bez potrzeby tworzenia nowego questa.

### Przykład

```text
NPC Anna
relation = friendly

Quest:
„Znajdź wilczą jamę”

required relation = trusted

→ Anna nie oferuje questa
```

Po wykonaniu innych zadań:

```text
relation = trusted

→ quest staje się dostępny
```

## Faza 2 — Poziomy reputacji

Wprowadzić minimalne poziomy relacji:

```text
stranger
acquainted
friendly
trusted
```

Dokładne wartości liczbowe powinny pozostać szczegółem implementacyjnym. Progi powinny być skonfigurowane w jednym miejscu.

Nie należy jeszcze projektować rozbudowanej reputacji z dziesiątkami rang, globalną reputacją, frakcjami ani reputacją regionalną.

Architektura powinna jednak umożliwiać późniejsze rozszerzenie.

## Faza 3 — Reputacja jako efekt questa

Quest może zmieniać relację, np. przez efekt końcowy:

```ts
rewards: {
  relation: +1
}
```

lub równoważny model zgodny z istniejącą architekturą.

Efekt powinien korzystać z istniejącego `QuestManager` i jego relation state.

Nie tworzyć drugiego mechanizmu zapisywania relacji.

W przyszłości inne wydarzenia świata również będą mogły zmieniać reputację.

## Faza 4 — Quest: groźny wilk

Pierwszy rzeczywisty quest testujący nowy model.

Przykład:

> „W okolicy wioski pojawił się groźny wilk. Mieszkańcy boją się wychodzić poza osadę.”

Warunek:

```text
required relation: trusted
```

Cele:

```text
1. znaleźć / spotkać wilka
2. zlikwidować zagrożenie
3. wrócić do NPC
```

Quest nie powinien sam wykonywać logiki walki.

Powinien reagować na istniejący flow:

```text
AnimalAgent
    ↓
HealthState
    ↓
damage
    ↓
death
    ↓
quest objective completed
```

## Faza 5 — Quest: wilcza jama

Rozszerzenie poprzedniego przypadku.

Wilcza jama powinna być rzeczywistym elementem świata, a nie tylko quest markerem.

Docelowy model:

```text
WolfDen
 ├── position
 ├── identity
 └── wolf spawning / threat
```

Quest:

> „Znajdź wilczą jamę i zlikwiduj zagrożenie.”

Cele:

```text
1. odnaleźć jamę
2. rozwiązać problem jamy
3. wrócić do zleceniodawcy
```

Jeżeli istniejący `PreySpawner` może zostać rozszerzony semantycznie do tego przypadku, należy go wykorzystać zamiast tworzenia równoległego `QuestSpawner`.

## Faza 6 — Questy związane ze zwierzętami gospodarskimi

Wykorzystać istniejące zwierzęta gospodarskie, m.in. konie, owce, kury i krowy.

Przykładowe questy:

```text
„Zaginęła owca.”
„Znajdź konia.”
„Ktoś widział kurę poza gospodarstwem.”
```

### Wymaganie

Aby takie questy były możliwe, konkretne zwierzę gospodarskie musi posiadać stabilną identity oraz informację o właścicielu / gospodarstwie.

Przykładowo:

```ts
AnimalAgent
  → animalId
  → ownerHouseId
  → kind
```

Nie należy implementować questów typu „znajdź konkretną owcę”, dopóki nie ma stabilnej tożsamości zwierzęcia.

## Faza 7 — Questy związane z landmarkami

Wykorzystać istniejący system proceduralnych landmarków.

Quest może wskazywać:

```text
landmarkId
landmarkType
```

Przykłady:

> „Znajdź stare ruiny na północy.”

> „Odwiedź kamienny krąg.”

> „Odnajdź miejsce, o którym opowiadał mój dziadek.”

Landmark nie powinien automatycznie oznaczać questa.

Zasada:

```text
landmark
    ↓
może istnieć bez questa

quest
    ↓
może opcjonalnie wskazywać landmark
```

Quest powinien korzystać z istniejącej identity/pozycji landmarku.

## Faza 8 — Kopanie, ścinanie i sadzenie jako cele questów

Nowe mechaniki świata powinny być możliwe do wykorzystania przez questy bez tworzenia specjalnych wersji akcji.

Przykłady:

```text
„Wykop kamień z określonego miejsca.”
„Przygotuj miejsce pod nowe drzewa.”
„Zasadź kilka drzew w okolicy gospodarstwa.”
„Zdobądź drewno na naprawę domu.”
```

W szczególności questy związane z drewnem powinny korzystać z istniejącego lifecycle drzewa, a quest nie powinien sam zarządzać tym cyklem.

## Faza 9 — Bandyci

Bandyci są późniejszym konsumentem systemu, nie wymaganiem do ukończenia pierwszej wersji.

Przyszłe questy:

```text
„Bandyci napadają na podróżnych.”
„Znajdź ich obóz.”
„Odzyskaj skradzione zapasy.”
„Zabezpiecz drogę.”
```

System questów powinien już jednak umożliwiać taki model:

```text
NPC / world event
       ↓
hostile group
       ↓
world problem
       ↓
quest
```

Nie tworzyć jeszcze pełnego systemu bandytów w ramach tego planu.

## Faza 10 — Quest effects

Wprowadzić generyczny, ale ograniczony model efektów kończących questa.

Pierwsze efekty:

```text
relation
exp
```

Później:

```text
inventory
money
world state
village state
NPC state
```

Nie implementować wszystkich typów efektów od razu.

## Faza 11 — UI i feedback

Quest log powinien pokazywać stan wymaganej reputacji, jeżeli ma to znaczenie.

Przykład:

```text
🔒 Zaufanie wymagane

Relacja z Anną:
Friendly

Wymagane:
Trusted
```

Nie ujawniać koniecznie wszystkich ukrytych questów.

Preferowany model to komunikat NPC w sytuacji, gdy design wymaga świadomego komunikowania blokady. W przeciwnym przypadku quest pozostaje niewidoczny.

---

# Persystencja

Jeżeli aktualny system questów nadal przechowuje stan wyłącznie w pamięci, **nie rozszerzać zakresu tego planu o pełną persystencję**, chyba że aktualny codebase w międzyczasie już ją wprowadził.

Jeżeli relacja zostanie później zapisywana w save:

```text
Quest state
+
Relation state
```

powinny być traktowane jako część jednego persistent simulation state.

---

# Architektura

Nie tworzyć:

```text
ReputationManager
QuestReputationSystem
WorldQuestManager
WolfQuestManager
LandmarkQuestManager
```

Preferowany kierunek:

```text
QuestManager
 ├── quest definitions
 ├── quest state
 ├── availability checks
 ├── objectives
 └── quest effects

existing world systems
 ├── fauna
 ├── landmarks
 ├── resources
 ├── trees
 ├── digging
 └── NPCs
```

QuestManager jest konsumentem stanu świata, a nie jego właścicielem.

---

# Poza zakresem

- generator questów,
- LLM-generated quests,
- GOAP / Utility AI dla questów,
- pełny system frakcji,
- globalna reputacja świata,
- ekonomia nagród,
- rozbudowany system bandytów,
- pełna persystencja wszystkich systemów,
- proceduralne generowanie całych quest chains,
- automatyczne tworzenie questów dla każdego landmarku,
- quest marker GPS prowadzący gracza za rękę.

---

# Kryteria akceptacji

- [ ] Istniejący relation/sympathy jest wykorzystywany zamiast tworzenia równoległego systemu reputacji.
- [ ] Relation ma czytelne poziomy, w tym `trusted`.
- [ ] Quest może mieć warunek minimalnej relacji.
- [ ] Quest niespełniający warunku nie jest oferowany.
- [ ] Osiągnięcie wymaganego poziomu odblokowuje quest.
- [ ] Ukończenie questa może zwiększyć relację.
- [ ] Quest może obserwować śmierć konkretnego zwierzęcia poprzez istniejący Health/death flow.
- [ ] Quest może wskazywać konkretny landmark.
- [ ] Quest może wykorzystywać istniejące mechaniki kopania, zbierania i ścinania drzew.
- [ ] Żaden quest nie duplikuje logiki świata.
- [ ] Przykładowy quest „groźny wilk” działa end-to-end.
- [ ] Przykładowy quest „wilcza jama” może działać po udostępnieniu odpowiedniej identity/world state jamy.
- [ ] Istnieje architektoniczna możliwość dodania questów bandytów bez tworzenia nowego systemu questów.
- [ ] `npx tsc --noEmit`, `npm run lint` i `npm run build` przechodzą.

---

# Przykładowy przepływ

```text
Anna
relation = friendly
        ↓
quest „Wilcza jama”
required = trusted
        ↓
NIE MOŻNA JESZCZE OTRZYMAĆ

Gracz wykonuje inne zadania
        ↓
relation = trusted
        ↓
Anna oferuje quest
        ↓
Gracz znajduje wilczą jamę
        ↓
likwiduje zagrożenie
        ↓
wraca do Anny
        ↓
quest complete
        ↓
relation +1
        ↓
kolejny, bardziej wymagający quest
```

To powinno być głównym wzorcem dla dalszego rozwoju questów Seedvale: **reputacja otwiera dostęp do coraz bardziej odpowiedzialnych problemów świata, zamiast po prostu odblokowywać kolejne poziomy RPG.**

## Powiązane plany

- `2026-08-07--015--quests-v1.md`
- `2026-08-07--018--quests-v2-world-interactions.md`
- `2026-08-08--030--world-elements-interactions.md`
- `2026-08-09--049--procedural-world-landmarks.md`
- `2026-08-10--045--health-stamina-threat.md`
- `2026-08-10--056--hungry-predator-human-aggression.md`
- `2026-08-10--057--axe-player-tree-harvesting.md`
- `2026-08-10--058--living-forest-tree-lifecycle.md`
