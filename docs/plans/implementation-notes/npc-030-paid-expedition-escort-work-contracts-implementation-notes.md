# Implementation Notes: Paid expedition escort Work Contracts

**Plan:** `npc-030-paid-expedition-escort-work-contracts.md`  
**Reviewed:** 2026-09-11  
**Status:** `planned` 📋

## Review result

Plan jest kierunkowo poprawny, ale aktualny codebase ma dwa istotne ograniczenia, które implementation agent musi potraktować jako część właściwej zmiany, nie drobne dopiski:

1. `npc-029` nie jest jeszcze zaimplementowany i sam zależy od nadal planowanego `settlements-npcs-019`. `npc-030` nie powinien stabilizować własnego follow/off-screen API przed finalnym kontraktem tych dwóch planów.
2. Obecny Work Contract jest nie tylko construction-oriented w danych. Cały runtime zakłada stały measurable target: creation wymaga `target/x/z`, każdy aktywny kontrakt dostaje flagę przy celu, discovery wymaga `groupRemainingWork() > 0`, a UI tworzenia kontraktu zaczyna od world targetu. Escort wymaga rozdzielenia tych założeń również w runtime API/presentation/discovery.

Najpierw zaimplementować i zweryfikować dependency chain `settlements-npcs-019 → npc-029`, potem zrobić preflight `npc-030` względem ich finalnych public seams.

## 1. Work Contract model: discriminated scope, bez optional-field soup

`src/world/workContract.ts` jest właściwym miejscem na wąskie uogólnienie kontraktu.

Nie dodawać `escort` do obecnych `WorkType` / `ContractTarget`, bo helpers takie jak `groupRemainingWork()`, `expectedCandidateWork()`, `contractRewardRate()` i target lifecycle mają mierzalną semantykę.

Preferować discriminated scope na rekordzie, np. odpowiednik:

```ts
type WorkContractScope =
  | { kind: 'measurable_work', ...obecne target/progress fields... }
  | { kind: 'expedition_escort', terms: ExpeditionEscortTerms }
```

Obecne construction fields powinny pozostać razem w measurable branch, zamiast stawać się wieloma nullable fields na każdym kontrakcie.

Nie generalizować tego dalej do frameworka generic objectives/jobs.

## 2. V1 escort powinien być single-worker

Obecny `rewardCoins` jest group reward ceiling, a construction może mieć `requestedWorkerCount > 1`. Dla escort plan definiuje pełne `rewardCoinsDue = rewardCoins` po fulfilment.

Dlatego V1 escort powinien jawnie wymuszać dokładnie **1 aktywnego escort worker**. Inaczej dwa successful assignments miałyby sprzeczną semantykę reward ceiling.

Nie próbować w tym planie projektować party hiring / dzielenia nagrody między wielu eskortujących.

## 3. Runtime `createWorkContracts.ts`: nie udawać world targetu

Aktualne `CreateWorkContractParams` wymagają measurable targetu, a `spawnFlag()` jest wywoływany dla każdego non-terminal record.

Najbezpieczniej rozdzielić creation seam na dwa jawne warianty, np.:

- measurable-work create — zachowuje target collision, `x/z`, flagę,
- escort create — terms + reward, bez target flag.

Może to być discriminated `create(params)` lub dwa małe public methods; ważne, aby escort nie dostawał fake `ContractTarget` ani arbitralnego `x/z` tylko po to, by przejść obecne API.

`hasActiveContract()` / `findByTarget()` / `sameContractTarget()` pozostają measurable-target APIs. Nie rozszerzać ich semantyki na escort.

## 4. Discovery/posting: notice board reuse, progress gate scope-aware

Notice-board ownership jest właściwy do reuse: `postedBoardId`, `postedAt`, `advertisement`, `postedAt()` i fizyczne board interaction mogą obsługiwać oba scope.

Natomiast `isContractDiscoverable()` obecnie wymaga:

```text
groupRemainingWork(record) > 0
```

Po generalizacji warunek availability musi zależeć od scope:

- measurable work: obecny remaining-work + free slot,
- escort: non-terminal + posted + brak aktywnego assignmentu + poprawne finite terms.

Nie twórz drugiego `EscortNoticeBoard` ani osobnej listy ofert.

## 5. Assignment lifecycle: najmniejsza zmiana, ale jawna semantyka service

`WorkContractAssignmentState` ma dziś `accepted | travelling | working | ...`. Escort nie powinien wykonywać fikcyjnego `travelling → working` do statycznego contract targetu.

Preferować małe rozszerzenie typu `serving` dla aktywnej usługi escort i dodać je do neutralnego active-assignment predicate. Nie robić repo-wide rename `working → performing`.

`workStartedAt` jest dziś construction semantic. Nie używać go niejawnie jako escort service start tylko dlatego, że istnieje. Dla escort zapisać jawny absolute service timing potrzebny do fulfilment/cancellation, najlepiej w scope-specific assignment/service data:

```text
serviceStartedAt
serviceEndsAt   // gdy duration/timeout istnieje
```

To timing assignmentu, nie live follow executor state.

## 6. Accompany ownership po npc-029

Po acceptance/provisioning Work Contract powinien wywołać public lifecycle seam z `npc-029` i utworzyć dokładnie jeden commitment ze source wskazującym ten assignment (`contractId + npcId` lub finalny odpowiednik).

Nie pisać bezpośrednio do `NpcAuthoritativeState` z Work Contracts, jeśli `npc-029` dostarczy source-neutral lifecycle helpers.

Authority:

```text
Work Contract assignment
→ czy płatna usługa nadal istnieje + terms/payment

NpcAccompanyCommitment
→ follow/stay execution + interruption/resume + separation/off-screen
```

Reconciliation ma być jednokierunkowe od aktywnego escort assignmentu do commitmentu. Brak commitmentu można naprawić; stale commitment po terminal assignment trzeba usunąć. Commitment nie może sam wskrzeszać kontraktu.

## 7. Acceptance/conflicts: rozszerzyć istniejący invariant

`createWorkContracts.ts::findActiveWorkByNpc()` + `accept()` już wymuszają jeden work-active assignment per NPC.

Po generalizacji warto nadać lookupowi neutralną nazwę (`findActiveAssignmentByNpc` lub podobną), ale tylko jeśli wszystkie call-sites można bezpiecznie przepiąć. Nie utrzymywać równolegle dwóch lookupów opisujących ten sam exclusivity rule.

Acceptance escort musi dodatkowo odrzucić niekompatybilny accompany commitment przed side effects. Konflikt ma być boundary invariant, nie score penalty i nie arbitration per tick.

## 8. Scoring: wspólna selekcja, scope-specific cost model

`src/ai/npcWorkContract.ts` pozostaje właściwym pure evaluator/selekcją. Nie duplikować recruitment pipeline.

Wspólne inputy: role, effective schedule, workplace, needs/provisions, relation/social data, travel/time burden.

Measurable branch może nadal używać `expectedCandidateWork()` / `contractRewardRate()`.
Escort branch powinien używać:

- pełnego offered `rewardCoins`,
- expected away duration,
- suitability (guard/hunter jako nudge, nie eligibility flag),
- schedule/profession opportunity cost,
- relation/reputation/renown z istniejącego `PlayerSocialLookup`,
- istniejących traits/personality tylko jeśli są już dostępne bez nowego store,
- bounded conservative danger estimate.

Nie uruchamiać global pathfinding ani route fauna scan podczas scoringu.

`NpcAgent.tryAcceptWorkContractOpportunity()` powinien nadal odkrywać/scorować oferty z lokalnej tablicy; nie dodawać osobnego `tryAcceptEscortOpportunity()` jeśli jedyna różnica jest scope-specific evaluator.

## 9. Provisioning: uogólnić expected-away duration, nie kontrakt

`src/ai/npcPersonalProvisions.ts` ma dobrą logikę realnych transferów z household do `personalInventory`, ale estimate API jest dziś zbudowane jako `travelHours + workHours`.

Wydzielić neutralny estimator przyjmujący `awayHours` (lub odpowiednik), zachowując obecne construction wrappery:

```text
construction → travel + expected measurable work
escort       → duration / bounded destination estimate
```

Actual provisioning nadal ma korzystać z:

- `personalInventory`,
- household food,
- household water,
- istniejących waterskin/liquid APIs.

Nie dodawać expedition ration state.

## 10. Destination: reuse world identities, ale resolver w app/world seam

Nie wkładać `THREE.Object3D` ani live settlement object do terms.

Wspierać tylko stabilne semantic refs, które aktualny codebase umie deterministycznie rozwiązać, np. settlement id oraz istniejący `WorldLocation` id. Resolver pozycji/arrival context powinien być w warstwie composition/world integration, nie w pure `workContract.ts`.

Nie wykonywać cold/global World Location scans per NPC scoring tick. Destination musi być już konkretnie wybrane przy tworzeniu kontraktu; evaluation dostaje bounded resolved metadata/snapshot.

Shared-arrival fulfilment powinien korzystać z resolved destination radius/context oraz stanu separation z `npc-029`, nie z samego `playerDistance < X`.

## 11. Payment/cancellation: reuse claim lifecycle, nowy pure claim rule

Zachować istniejące assignment-owned:

- `rewardCoinsDue`,
- `payment_due`, `paid`, `unpaid`, `uncollectable`,
- request throttle/deadline,
- `src/app/actions/workContractPayment.ts`,
- `transferInventoryCount()` player Inventory → NPC `personalInventory`.

Nie przepychać escort przez `assignmentRewardCoinsDue(record, workCompleted)`, bo ta funkcja jest poprawnie construction-specific.

Dodać pure scope-aware claim freeze:

- success → full reward,
- duration cancellation po service start → floor/clamped proportional elapsed duration,
- cancellation before start → 0,
- destination-only cancelled before arrival → 0,
- abandonment → 0,
- death → tylko claim zamrożony wcześniej.

Claim freeze musi nadal być idempotentny i gwarantować `0 <= due <= rewardCoins`.

## 12. Player creation UI: reuse Work Contract family, ale nie placement flow

`src/app/actions/workContractActions.ts` jest obecnie całkowicie target-centric: placement/hire-help → work share → worker count → reward.

Escort powinien dostać osobny **entry flow w tym samym module/family**, np. Quick Action / Work Contracts action:

```text
escort terms
→ destination/duration policy
→ reward
→ create unposted contract
→ istniejące notice-board posting
```

Reuse `openFlavorDialog` i obecny posting/list/cancel UX. Nie dodawać placement preview, contract flag ani osobnego companion-hiring menu.

Dla destination picker pokazywać tylko miejsca, które runtime potrafi stabilnie zidentyfikować/resolve; nie zapisuj display label jako identity.

## 13. Persistence/migration

Aktualny schema baseline to `CURRENT_SAVE_VERSION = 29`. `SaveWorkContract` nadal mirroruje construction-only fields, więc discriminated scope jest realną zmianą persisted representation i wymaga normalnego bump + migration.

Migracja legacy records jest prosta semantycznie:

```text
każdy istniejący Work Contract
→ scope.kind = measurable_work
→ wszystkie istniejące target/progress/payment fields zachowane 1:1
```

Nie inferować żadnych escort records ze starych danych.

Po implementacji `npc-029` commitment będzie persistowany przez `SaveData.npcStates`; escort-specific contractual terms pozostają w `SaveData.workContracts`. Nie duplikować source/terms w obu miejscach poza minimalnym source ref potrzebnym commitmentowi.

## 14. Testy o największej wartości

Priorytetowo:

- migration v29 → new schema zachowuje istniejący construction contract bit-for-bit semantycznie;
- existing construction creation/discovery/multi-worker/payment tests nadal przechodzą;
- escort create nie tworzy target flag i nie wymaga fake target/work counters;
- posted escort jest discoverable mimo braku `groupRemainingWork`;
- tylko jeden NPC może zaakceptować V1 escort;
- acceptance tworzy dokładnie jeden matching accompany commitment;
- restore/rebuild: active assignment + missing commitment naprawia commitment, terminal assignment usuwa stale commitment;
- need/combat/flee interruption nie kończy assignmentu ani commitmentu;
- duration fulfilment po absolute world time;
- shared destination arrival, nie player-only arrival;
- cancellation claim rules i exactly-once payment;
- NPC death/abandonment cleanup jest idempotentny.

## 15. Zalecana kolejność

```text
1. Zaimplementować settlements-npcs-019, potem npc-029; sprawdzić finalne public APIs.
2. Wprowadzić discriminated Work Contract scope + save migration, zachowując measurable regressions.
3. Uogólnić runtime create/discovery/active-assignment lookup bez escort-specific registry.
4. Dodać escort terms + pure service lifecycle/claim rules.
5. Uogólnić provisioning/scoring na scope-aware expected-away inputs.
6. Podpiąć acceptance ↔ npc-029 commitment + reconciliation.
7. Dodać destination resolution/fulfilment.
8. Dodać player creation flow + reuse notice board/payment UX.
9. Dodać boundary/persistence tests i aktualizację state docs.
```

## Najważniejsze pliki

- `src/world/workContract.ts`
- `src/world/createWorkContracts.ts`
- `src/ai/npcWorkContract.ts`
- `src/ai/npcPersonalProvisions.ts`
- `src/ai/NpcAgent.ts`
- `src/app/actions/workContractActions.ts`
- `src/app/actions/workContractPayment.ts`
- `src/persistence/saveData.ts`
- `src/world/createWorkContracts.test.ts`
- `src/persistence/saveData.test.ts`
- finalne commitment/travel files z `npc-029` / `settlements-npcs-019`

Po implementacji zaktualizować `docs/state/npc.md`, `docs/state/player-systems.md` i `docs/state/persistence.md`. Dodać JSDoc `@domain npc` do nowych publicznych lifecycle/scope helperów, które mają być znajdowane przez preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
