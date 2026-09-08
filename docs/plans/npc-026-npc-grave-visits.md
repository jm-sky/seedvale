# Plan: NPC Grave Visits

**Created:** 2026-09-08
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** S
**Depends on:** `npc-011` `world-terrain-016`
**Domain:** `npc`
**Subdomains:** `behavior` `decision-making` `relationships`
**Tags:** `graves` `households` `cemetery`
**Roadmap:** -

## Cel

Dodać mały, autonomiczny mechanizm, dzięki któremu NPC czasem odwiedzają groby osób, z którymi byli powiązani.

V1 ma reuse istniejące systemy i pozostać prostym optional behaviour:

```text
deceased NPC
→ persistent grave
→ household / existing meaningful relation
→ simple visit opportunity
→ normal AI arbitration
→ walk to grave
→ short stay
→ normal AI resumes
```

Mechanika działa bez udziału gracza i tworzy naturalną podstawę dla późniejszych świadków wydarzeń na cmentarzu.

Nie budować osobnego systemu żałoby, pamięci ani cemetery scheduling.

## 1. Wizyta dotyczy konkretnego persistent grave

NPC nie podejmuje abstrakcyjnej decyzji `go to cemetery`, tylko `visit grave of NPC X`.

Wymagany contract z `npc-011`:

```text
deceased NpcId
→ persistent grave
→ world position
```

Twardy invariant V1:

```text
grave visit requires an existing persistent grave
```

Jeżeli NPC zmarł, ale nie został jeszcze pochowany, nie może powstać grave visit.

Nie używać proceduralnych graves z cemetery layout jako celu wizyty.

## 2. Household jest podstawowym źródłem eligibility

V1 nie może zależeć wyłącznie od rozwiniętych relacji interpersonalnych, ponieważ na początku świata mogłyby nie istnieć wystarczająco silne relationships.

Podstawowa reguła:

```text
living NPC belongs to deceased household
→ eligible to visit grave
```

Household zapewnia minimalny, od początku działający social connection.

Jeżeli obecny relationship system już posiada prostą, istniejącą semantykę pozwalającą rozpoznać meaningful relationship, można jej użyć jako dodatkowego źródła eligibility:

```text
existing meaningful relationship with deceased
→ also eligible
```

Nie tworzyć dla tego planu nowego relationship scoringu, progów ani archetypów. Jeżeli current code nie daje prostego istniejącego rozstrzygnięcia, V1 działa tylko na household, a rozszerzenie o relationships pozostaje późniejszym krokiem.

## 3. Grave musi zachowywać potrzebny kontekst po śmierci

Po burial musi być możliwe ustalenie:

```text
grave
→ deceased NpcId
```

oraz minimalnego kontekstu pozwalającego odnaleźć członków household zmarłego.

Jeżeli lifecycle zmarłego usuwa informacje potrzebne do późniejszego lookup, contract `npc-011` musi zachować minimalny trwały kontekst.

Nie tworzyć osobnego grave-household registry, jeżeli można reuse istniejący persisted ownership.

## 4. Prosta częstotliwość

NPC nie powinien odwiedzać tego samego grobu często.

Wystarczy prosty mechanizm:

```text
eligible
+ same grave not visited recently
+ optional activity opportunity
→ small deterministic chance / propensity to visit
```

Ocena odbywa się podczas istniejącego low-frequency decision cadence.

Nie implementować:

- grief decay,
- grief stages,
- anniversaries,
- remembrance scoring,
- family-role weights,
- rozbudowanej probabilistyki.

## 5. Prosty cooldown

Semantyczny contract:

> Ten sam NPC nie powinien zbyt szybko ponownie odwiedzać tego samego grobu.

Preferować najprostszy stan pasujący do obecnej architektury. Nie wymuszać mapy `visitorNpcId + deceasedNpcId`, jeżeli wymagałaby nieproporcjonalnej zmiany persistence.

Jeżeli istniejący NPC state pozwala tanio zachować last visit per deceased/grave, jest to preferowane, ponieważ odwiedzenie jednego grobu nie powinno niepotrzebnie blokować wszystkich innych wizyt.

Nie dodawać globalnego visit registry.

## 6. Decision priority

Grave visit jest optional activity o niskim priority.

Nie powinien wygrywać z:

- danger,
- combat,
- fleeing,
- critical needs,
- pilną pracą.

Powinien konkurować głównie z idle/home/leisure i innymi niewymagającymi aktywnościami.

Reuse istniejący AI arbitration. Nie tworzyć osobnego scheduler-a cemetery visits.

## 7. Time of day

V1 nie potrzebuje rozbudowanego modelu godzin odwiedzin.

Preferować naturalne zachowanie wynikające z istniejącego schedule i decision timing. Lekka preferencja dnia / późnego popołudnia jest dopuszczalna tylko wtedy, gdy można ją uzyskać przez istniejący mechanizm bez dokładania osobnej probabilistyki.

Nie wprowadzać zakazu nocnych wizyt. NPC może znaleźć się przy grobie nocą w wyniku normalnego przebiegu dnia.

## 8. Plan/action

Wizyta używa normalnego flow:

```text
decision
→ visit-grave plan/action
→ navigation
→ arrival
→ short stay
→ complete
```

Target zachowuje semantic identity konkretnego deceased/grave, nie tylko cemetery position.

Nie implementować cemetery-specific pathfinding ani movement systemu.

## 9. Short stay

Po dotarciu NPC pozostaje przy grobie przez krótki, rzeczywisty czas.

Nie może to być `arrive → complete` w tym samym ticku.

```text
arrive
→ stand near grave
→ short deterministic duration
→ complete
```

Idle wystarczy. Facing grave można dodać tylko jeśli tanio reuse istniejący mechanism.

Nie dodawać rytuałów ani nowych animacji jako wymagania V1.

## 10. Interruptions

Jeżeli podczas planu pojawi się ważniejszy stan, normalny AI lifecycle powinien móc przerwać wizytę i wykonać replan.

Dotyczy przede wszystkim danger, combat, fleeing i critical needs.

Nie tworzyć specjalnego cancellation systemu dla grave visits.

## 11. Shared cemeteries

`world-terrain-016` może przypisać dwa `SM` settlements do jednego shared cemetery.

Grave visit nie potrzebuje specjalnej obsługi tego przypadku. NPC idzie do konkretnego persistent grave, więc mieszkańcy obu osad mogą naturalnie pojawiać się w tym samym cemetery.

To jest pożądany emergent effect, ale plan nie dodaje dodatkowych interakcji pomiędzy visitorami.

## 12. Cemetery classification nie steruje wizytą

Dla grave visit nie ma znaczenia, czy cemetery jest settlement cemetery czy abandoned cemetery.

Liczy się wyłącznie:

```text
known deceased
→ existing persistent grave
```

NPC nie wybiera cemetery przez nearest lookup.

## 13. World independence

Wizyta nie może być wywoływana przez gracza.

Nie:

```text
player enters cemetery
→ spawn visitor
```

Nie:

```text
player digs grave
→ send NPC there
```

NPC odwiedza grób dlatego, że jego AI niezależnie podjął taką decyzję.

Dzięki temu późniejszy witness system może otrzymać prawdziwy emergent przypadek:

```text
NPC independently visits grave
+
player happens to be digging nearby
→ possible witness
```

## 14. Hybrid simulation

Nie wymuszać detailed simulation tylko po to, aby NPC odbył grave visit.

Reuse istniejący model simulation fidelity.

Dla aktywnie symulowanego NPC można wykonać real navigation i short stay. Dla remote NPC zachować zgodność z istniejącym modelem bez ładowania chunków i pathfindingu.

Nie tworzyć off-screen grave visit simulator.

## 15. Performance

Nie wykonywać per-frame:

- grave scans,
- household scans,
- relationship scans.

Candidate lookup powinien zaczynać się od istniejących powiązań NPC:

```text
NPC
→ own household / existing meaningful relationships
→ deceased members
→ persistent graves
```

Nie skanować wszystkich graves w świecie.

Ocena odbywa się tylko podczas istniejącego low-frequency decision cadence.

Web Worker nie jest potrzebny.

## 16. State ownership

Preferowany podział:

```text
npc-011 burial
→ persistent grave + deceased identity

household / existing relationships
→ who is eligible

NPC AI
→ whether visit happens now

plan/action
→ execution

navigation
→ travel

minimal existing NPC state
→ cooldown if required
```

Nie tworzyć `GraveVisitManager`, `MourningManager` ani cemetery scheduler.

## 17. Scope exclusions

Poza V1:

- grief simulation i grief stages,
- anniversaries,
- remembrance model,
- flowers, candles i offerings,
- prayer i kneeling animations,
- multi-grave visits,
- coordinated household visits,
- funeral processions,
- cemetery conversations,
- gossip,
- witness logic,
- reputation,
- observation memory / `lastSeen`,
- crime system,
- dedicated cemetery schedule activity,
- nowy relationship scoring tylko dla grave visits.

## 18. Recon przed implementacją

Przed implementacją zweryfikować aktualny `main`:

1. `npc-011` grave representation i lifecycle,
2. czy po śmierci zachowany jest lookup deceased → household,
3. persisted household membership,
4. istniejącą relationship representation i czy posiada już prostą semantykę meaningful relationship,
5. NPC decision/arbitration,
6. plans/actions,
7. navigation target semantics,
8. interruption/replan flow,
9. world time / możliwy cooldown representation,
10. remote NPC simulation.

Jeżeli current code ma odpowiedni optional-activity / pressure mechanism, reuse go.

Nie tworzyć nowego pressure/goal abstraction bez potrzeby.

Jeżeli `npc-011` nie zapewnia jeszcze taniego stable lookup `deceasedNpcId → persistent grave`, potraktować to jako dependency contract/blocker zamiast tworzyć równoległy registry.

## 19. Implementation direction

Preferowany flow:

```text
NPC decision cadence
        ↓
household / existing meaningful relations
        ↓
known deceased with persistent grave
        ↓
same grave not visited recently
        ↓
simple visit opportunity
        ↓
normal arbitration
        ↓
visit grave
        ↓
navigate
        ↓
short stay
        ↓
update minimal cooldown state if needed
        ↓
normal AI
```

Important public/architectural additions powinny otrzymać JSDoc tam, gdzie pomaga to preflight discovery, preferując `@domain npc`.

## 20. Implementation order

1. Zweryfikować `npc-011` persistent grave contract.
2. Zweryfikować dostępność household po śmierci NPC.
3. Dodać prosty lookup eligible deceased dla living NPC przez household.
4. Reuse existing meaningful relationships tylko jeśli obecny system daje prosty contract bez nowego scoringu.
5. Dobrać najprostszy cooldown pasujący do obecnego NPC state/persistence.
6. Włączyć visit opportunity do istniejącej arbitration.
7. Dodać semantic grave target.
8. Dodać/reuse visit plan/action.
9. Reuse navigation.
10. Dodać short stay duration.
11. Zweryfikować interruption/replan.
12. Zweryfikować shared cemetery.
13. Zweryfikować remote simulation.
14. Dodać testy.
15. Utworzyć implementation notes.
16. Zaktualizować relevant STATE/docs.

## 21. Automated verification

### Eligibility

- member household zmarłego może zostać kandydatem,
- mechanika działa bez wcześniej rozwiniętej silnej relationship,
- existing meaningful relationship może rozszerzyć eligibility tylko jeśli taki contract już istnieje,
- unrelated NPC nie odwiedza losowego grave,
- deceased bez persistent grave nie generuje visit,
- procedural grave nie jest celem wizyty.

### Frequency

- ten sam NPC nie odwiedza tego samego grave zbyt często,
- visit pozostaje optional i rzadki,
- rozwiązanie nie wymaga rozbudowanego grief modelu.

### Arbitration

- danger wygrywa z visit,
- critical need wygrywa z visit,
- urgent work wygrywa z visit,
- visit może wygrać z idle/optional activity.

### Execution

- NPC idzie do konkretnego persistent grave,
- pozostaje przy nim przez realny krótki czas,
- kończy action,
- wraca do normalnej arbitration,
- visit może zostać przerwany przez ważniejszy stan.

### World semantics

- player presence nie uruchamia visit,
- player digging nie uruchamia visit,
- shared cemetery działa bez specjalnej visit logiki,
- cemetery classification nie jest używane jako nearest-destination heuristic.

### Performance

- brak per-frame scanów,
- brak global grave scan,
- lookup zaczyna się od household/istniejących relationships,
- remote NPC nie wymusza detailed simulation.

## 22. Manual verification

Manualną weryfikację wykonuje User w browserze.

Sprawdzić:

1. burial NPC,
2. późniejszą wizytę członka household,
3. działanie bez wcześniej rozwiniętej silnej relationship,
4. brak ciągłych/codziennych wizyt tego samego grobu,
5. dojście do konkretnego persistent grave,
6. realny krótki pobyt przy grave,
7. normalne odejście po visit,
8. przerwanie przez ważniejszą potrzebę lub danger,
9. visitor na shared cemetery,
10. brak związku pomiędzy player presence a pojawieniem się visitor.

AI agent nie wykonuje browser verification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
