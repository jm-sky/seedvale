# Plan: Merchant wealth tiers and travel party profile

**Created:** 2026-09-18
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** settlements-npcs-048, npc-053, items-player-047, npc-030
**Domain:** `settlements-npcs`
**Type:** `feature`
**Roadmap:** `quests-travelling-merchant-journeys.md`

## Goal

Wprowadzić dla istniejących Traderów trzy deterministic travel/economic profiles:

```text
poor
normal
rich
```

Tier nie jest nową profesją ani RPG levelem.

Jest derived charakterystyką istniejącego Merchant:

```text
deterministic initial merchant assortment
+ settlement context
+ merchant specialization/premium assignment
→ wealth tier
→ travel-party policy
```

Tier wpływa na:

- preferowany lekki transport;
- maksymalną liczbę escortów;
- oczekiwany poziom wyposażenia;
- profil party wykorzystywany przy Travelling Merchant journey.

Nie tworzyć osobnego Merchant Wealth systemu.

---

## 1. Verified current foundations

### Merchant profiles

`src/settlement/merchantTrade.ts` posiada:

```ts
resolveMerchantProfiles(...)
generateMerchantAssortment(...)
resolvePremiumMerchantAssignment(...)
```

Merchant profile jest deterministyczny i opiera się na:

- stable `npcId`;
- settlement terrain;
- settlement size;
- dominant resource;
- specialization;
- settlement seed.

### Stock generation

`generateMerchantAssortment()` generuje deterministic initial assortment.

Aktualny SKU budget:

```text
OUTPOST → 8
SM      → 14
MD      → 20
LG      → 26
XL      → 32
```

Quantity również skaluje się z settlement size.

To jest wystarczający V1 economic signal.

### Canonical valuation

Istnieją:

```ts
tradeValue(kind)
offerValue(offer)
instanceNominalValue(instance)
```

w `src/items/tradeCatalog.ts`.

Nie dodawać drugiego pricing resolvera.

---

## 2. Tier is derived, not persisted

Nie dodawać:

```ts
NpcAuthoritativeState.merchantWealthTier
```

Nie dodawać:

```text
MerchantWealthRegistry
SaveData.merchantWealth
```

Tier rekonstruujemy deterministycznie z tych samych danych, które tworzą initial merchant assortment.

Ważne:

```text
current depleted merchantStock
!=
wealth-tier input
```

Player kupujący towary nie powoduje:

```text
rich → normal → poor
```

Tier czyta initial generated assortment, nie obecny mutable stock.

---

## 3. Canonical wealth basis

Dodać pure resolver, np.:

```ts
merchantInitialStockValue(
  assortment: Partial<Record<ItemKind, number>>
): number
```

który deleguje do istniejącego:

```ts
offerValue(assortment)
```

Canonical basis:

```text
sum(initial quantity × tradeValue(kind))
```

Nie liczyć wartości z:

- inventory weight;
- liczby SKU;
- własnej tabeli cen.

Armor quality nie jest osobną podstawą tieru V1. Premium assignment jest osobnym sygnałem.

---

## 4. Settlement-size allowed ranges

Settlement size ogranicza możliwe tiers:

```text
OUTPOST → poor
SM      → poor | normal
MD      → poor | normal | rich
LG      → normal | rich
XL      → normal | rich
```

Mały outpost nie może dostać `rich` tylko przez jeden drogi item.

---

## 5. Absolute baselines, not peer ranking as primary rule

Nie opierać klasyfikacji głównie na rankingu Merchantów w tej samej osadzie.

Problem z relative-only rankingiem:

```text
two nearly identical merchants
→ one rich
→ one normal
```

wyłącznie dlatego, że jeden ma minimalnie większą wartość stocku.

Preferowany model:

```text
settlement size
→ allowed tier range
+
initialStockValue
→ compare against deterministic baselines for that settlement size
+
premium assignment
→ bounded promotion signal
```

Stable `npcId` służy tylko jako tie-break.

---

## 6. Baseline calibration

Nie wpisywać ręcznie progów typu:

```text
< 300 coins = poor
> 1000 coins = rich
```

Przed finalnym wdrożeniem thresholds zrobić deterministic test sweep istniejącego:

```ts
generateMerchantAssortment(...)
```

przez reprezentatywny zestaw:

- settlement sizes;
- terrains;
- dominant-resource variants;
- merchant specializations;
- seeds.

Z wyników wyprowadzić fixed per-size value baselines.

Thresholds po kalibracji mają być zwykłymi stałymi, testowanymi i stabilnymi.

Nie wykonywać runtime globalnych percentile scans.

---

## 7. Concrete tier policy shape

Dodać pure policy typu:

```ts
type MerchantWealthThresholds = {
  normalMin: number
  richMin: number | null
}
```

per settlement size.

Policy:

### OUTPOST

```text
always poor
```

### SM

```text
below normalMin → poor
otherwise       → normal
never rich
```

### MD

```text
below normalMin → poor
normal range    → normal
richMin+        → rich
```

### LG / XL

```text
below richMin → normal
richMin+      → rich
```

Nie ma poor w LG/XL V1.

Exact numeric constants wyprowadzić z sweepu w implementation notes/tests, nie z intuicji.

---

## 8. Premium assignment as bounded signal

`resolvePremiumMerchantAssignment()` jest już deterministic.

Premium assignment nie jest drugim random wealth roll.

Może działać jako bounded promotion signal:

```text
SM:
premium cannot create rich

MD:
premium merchant within normal band may promote to rich only if close to rich threshold

LG/XL:
premium merchant may promote to rich when within bounded margin below rich threshold
```

Nie robić:

```text
premium item => always rich
```

Exact promotion margin również skalibrować względem initial-stock sweep.

---

## 9. Resolver ownership

Dodać do `src/settlement/merchantTrade.ts` lub małego adjacent module:

```ts
export type MerchantWealthTier =
  | 'poor'
  | 'normal'
  | 'rich'

export function resolveMerchantWealthTier(...)
```

Resolver reuse:

```ts
generateMerchantAssortment()
resolvePremiumMerchantAssignment()
offerValue()
```

Nie czyta mutable `merchantStock`.

Nie wymaga persistence.

---

## 10. Wealth tier and travel profile stay separate

Dodać derived:

```ts
type MerchantTravelProfile = {
  tier: MerchantWealthTier
  preferredPackKinds: readonly ('donkey' | 'horse')[]
  maxEscorts: 0 | 1 | 2
  equipmentExpectation: 'basic' | 'standard' | 'premium'
}
```

Nie persistować tego obiektu.

---

## 11. Concrete travel profiles

### Poor

```text
preferred pack:
donkey → horse → none

max escorts:
0

equipmentExpectation:
basic
```

Poor Merchant preferuje donkey, ale realnie dostępny horse jest dozwolonym fallbackiem.

Nie blokować istniejącego zwierzęcia tylko z powodów stylistycznych.

### Normal

```text
preferred pack:
horse → donkey → none

max escorts:
1

equipmentExpectation:
standard
```

### Rich

```text
preferred pack:
horse → donkey → none

max escorts:
2

equipmentExpectation:
premium
```

Future:

```text
rich → cart/wagon preference
```

po wdrożeniu merchant cart journey.

---

## 12. Pack-animal integration

`settlements-npcs-048` pozostaje authority dla:

- eligibility;
- `packAnimalId`;
- persistence;
- capacity;
- journey continuity;
- death/detach semantics.

Ten plan przekazuje tylko:

```text
preferredPackKinds
```

do assignment policy.

Nie duplikować `packAnimalId`.

Nie spawnować animal.

---

## 13. Current escort foundation

Current `NpcAccompanyCommitment` ma:

```ts
NpcAccompanyTarget = { kind: 'player' }
```

więc nie obsługuje NPC target.

`npc-030` posiada jednak gotowe escort concepts:

- Guard/Hunter suitability;
- provisions estimate;
- follow/interruption/resume semantics;
- death/availability guards;
- generic accompany execution.

Nie tworzyć merchant-only escort AI.

Nie używać player Work Contract jako Merchant employer hack.

---

## 14. Actor-neutral accompany target

Rozszerzyć:

```ts
type NpcAccompanyTarget =
  | { kind: 'player' }
  | { kind: 'npc', npcId: NpcId }
```

Nie przechowywać live `NpcAgent`.

Target position rozwiązywać fresh przez injected lookup.

Ten sam mechanism ma móc później obsłużyć:

```text
NPC → Player
NPC → Merchant
NPC → Courier
NPC → Expedition leader
```

---

## 15. Generic world-party source

Nie dodawać source:

```text
merchant-escort
courier-escort
expedition-escort-2
```

Rozszerzyć source neutralnie, np.:

```ts
type NpcAccompanySourceRef =
  | { kind: 'voluntary' }
  | { kind: 'work-contract', contractId: string }
  | { kind: 'world-party', partyId: string }
```

Merchant journey będzie pierwszym consumerem `world-party`.

`partyId` musi być stable i reconstructable, np. związany z Merchant journey/identity, nie runtime counter bez persistence.

---

## 16. Merchant party identity

Preferowany stable party id:

```text
merchant-journey:<merchantNpcId>
```

jeżeli jeden Merchant może mieć tylko jedną active journey.

Jeżeli current architecture pozwala na future overlapping journey records, użyć stable journey-specific id.

Nie tworzyć globalnego party registry.

Party identity służy do:

- powiązania accompany commitments;
- reconciliation;
- atomic cleanup.

Nie przechowuje health/cargo/equipment.

---

## 17. Escort candidates

V1 candidate roles:

```text
guard
hunter
```

To reuse istniejącego escort suitability z `npc-030`.

Nie używać pozostałych profesji jako V1 guards.

Candidate musi:

- być adult/work-capable według istniejących participation rules;
- być alive;
- być w Merchant home settlement;
- nie być Merchantem;
- nie mieć incompatible Work Contract;
- nie mieć active incompatible accompany commitment;
- nie być away w innym hard travel commitment.

---

## 18. Escort ranking

Deterministic:

```text
guard
→ hunter
→ stable npcId
```

Nie dodawać runtime RNG.

Jeżeli `npc-030` ma już pure suitability resolver możliwy do reuse bez PlayerSocial context, wydzielić najmniejszy shared profession suitability helper zamiast kopiować tabelę.

Nie kopiować pełnej paid-contract scoring formula.

---

## 19. Escort count

Travel profile określa maksimum:

```text
poor   → 0
normal → up to 1
rich   → up to 2
```

Brak wymaganej liczby kandydatów nie powoduje spawnu.

Przykład:

```text
rich
+ only one eligible Guard
→ party has one escort
```

Journey nadal może rozpocząć się.

Journey Preparation / future route risk może później wprowadzić readiness gate.

---

## 20. Escort relation ownership

Authoritative companion relation pozostaje na escort NPC:

```text
guard NpcAuthoritativeState.accompanyCommitment
→ target merchantNpcId
→ source world-party
```

Nie kopiować pełnego escort state do Merchant.

Merchant party membership można resolve przez bounded NPC-state lookup po `partyId`.

Jeżeli implementation recon wykaże, że atomic startup/cleanup wymaga jawnej listy, dopuszczalne jest minimalne:

```ts
escortNpcIds?: NpcId[]
```

na `MerchantJourneyState`.

W takim wariancie lista jest membership index/reconciliation aid, a accompany commitment nadal jest execution commitmentem.

Nie utrzymywać dwóch niezależnych prawd o tym, czy NPC aktywnie followuje Merchant.

---

## 21. Escort movement

Reuse existing accompany execution/follow hysteresis/path rescue.

Detailed:

```text
escort
→ merchant target position
→ generic accompany execution
```

Dla dwóch escortów obaj mogą followować Merchant.

Existing crowd/separation odpowiada za local spacing.

Nie tworzyć caravan formation systemu.

---

## 22. Off-screen escort continuity

Merchant pozostaje party route authority.

Nie tworzyć osobnego MerchantEscort ETA modelu.

Każdy escort pozostaje realnym NPC i zachowuje:

- health;
- needs;
- inventory;
- death;
- own generic travel state where required by existing NPC travel handoff.

Off-screen party handoff ma reuse generic NPC travel mechanics.

Nie kopiować Merchant `travel` objectu jako source of truth do escort state.

---

## 23. Escort lifecycle endings

### Merchant returns home

```text
Merchant journey complete
→ end matching world-party commitments
→ escorts resume ordinary home life
```

### Guard dies

```text
normal NPC death lifecycle
→ commitment invalid/end
→ Merchant continues
```

Nie przypisywać replacement mid-journey.

### Merchant dies

```text
merchant death
→ matching world-party commitments end
→ living escorts remain real NPCs at current location/state
```

Nie teleportować ich home w tym planie.

Future failure/evidence plan może zdecydować o dalszym behaviour.

---

## 24. Equipment expectation only

Travel profile zawiera:

```text
basic | standard | premium
```

ale w tym planie jest to tylko policy hint.

Nie implementować:

- gear minting;
- journey-start provisioning;
- automatic armor upgrade;
- automatic weapon purchase.

`npc-053` pozostaje authority dla actual weapon/armor use.

Journey Preparation będzie authority dla uzupełniania braków z realnych źródeł.

---

## 25. Cargo integration

Current `selectConcreteFoodGoods()` już przyjmuje:

```text
carrier Inventory
maxTransfer
```

i używa:

```ts
carrier.canAdd(...)
```

Transport capacity już naturalnie ogranicza shipment.

Nie dodawać:

```text
poorCargoLimit
normalCargoLimit
richCargoLimit
```

Tier wpływa na cargo pośrednio:

```text
tier
→ transport preference
→ actual pack animal
→ actual transport capacity
→ existing cargo selection
```

Nie dublować capacity.

---

## 26. Settlement prosperity deferred

Nie istnieje authoritative:

```text
settlement wealth
treasury
profit
prosperity
```

Nie implementować ich tutaj.

Future signal może zostać później dodany jako input do wealth resolvera.

---

## 27. Trade success deferred

Nie istnieje Merchant P&L/business history.

Nie traktować current remaining stock jako success.

V1 tiers są stable i derived z initial world generation.

Future business progression może dodać promotion/demotion jako jawne events.

---

## 28. Route risk and party-threat handoff

Nie istnieje canonical historical/full-route risk score.

Nie używać `npc-030` default danger estimate jako world truth i nie skanować całej trasy przy wyliczaniu wealth tier.

Wealth tier określa:

```text
how much protection Merchant can plausibly field
```

a nie:

```text
how dangerous this exact route is
```

Jednocześnie escort nie może być wyłącznie wizualnym followerem. Ten plan musi przygotować actor-neutral party contracts tak, aby kolejny plan `settlements-npcs-051` mógł podpiąć realną współpracę przy zagrożeniu bez Merchant-specific combat AI:

```text
merchant / escort / pack animal receives real local threat
→ bounded party-local threat information
→ existing npcAnimalThreat arbitration
→ capable escort may defend
→ injured / incapable escort may flee
```

W tym planie:
- utrzymać stable `world-party` identity;
- NPC→NPC accompany musi zachować realne `NpcId`;
- nie implementować osobnego combat state dla party;
- nie kopiować guard responsibility / combat scoring.

`npc-048` pozostaje wzorcem generic local assistance, a `settlements-npcs-051` rozszerzy composition poza settlement-local forwarding tylko w zakresie wymaganym przez travelling party.

Future Dangerous Route system może wpływać na desired escort count/readiness jako osobny historyczny/world-risk input.

---

## 29. Journey commitment boundary

Current Merchant journey zaczyna się w `NpcAgent`, gdy Trader przyjmuje realną inter-settlement opportunity i ustawia:

```ts
merchantJourney = {
  homeSettlementId,
  destinationSettlementId,
  phase: 'outbound',
  transportOrderId,
}
```

Party formation musi odbywać się przy tym commitment boundary.

Nie dopiero przy stream-out.

---

## 30. Atomic party formation

Target flow:

```text
resolve wealth tier
→ resolve travel profile
→ resolve pack animal using 048
→ resolve escorts
→ create world-party accompany commitments
→ commit journey
```

Jeżeli final journey/order commitment się nie powiedzie:

- rollback newly-created party commitments;
- rollback pack travelling relation if created in this transaction;
- nie zostawiać orphan party state.

Brak optional animal/escort nie jest failure journey.

---

## 31. Suggested files

### `src/settlement/merchantTrade.ts`

Add:

```ts
MerchantWealthTier
merchantInitialStockValue()
resolveMerchantWealthTier()
resolveMerchantTravelProfile()
```

### `src/ai/npcAccompanyCommitment.ts`

Generalize:

```ts
NpcAccompanyTarget
NpcAccompanySourceRef
```

with NPC target + `world-party`.

Update clone/persistence validation.

### `src/ai/npcAccompanyExecution.ts`

Resolve Player/NPC target positions actor-neutrally.

Preserve Player behaviour.

### `src/settlement/merchantJourney.ts`

Own only journey semantic relation and optional minimal party-membership index if required.

Do not store tier.

### Merchant journey start in `NpcAgent`

Wire party policy at existing journey commitment seam.

---

## 32. Tests — wealth calibration/resolution

Add deterministic generator sweep test/helper covering:

- sizes;
- terrains;
- specializations;
- representative seeds.

Use it to document chosen thresholds.

Production tests assert fixed resolved thresholds afterwards; they must not depend on statistical randomness.

Verify:

- same context → same tier;
- mutable stock depletion → no tier change;
- OUTPOST never rich;
- SM never rich;
- LG/XL never poor under V1 policy;
- no duplicated valuation table.

---

## 33. Tests — travel profiles

```text
poor:
donkey → horse
0 escorts
basic expectation

normal:
horse → donkey
<=1 escort
standard expectation

rich:
horse → donkey
<=2 escorts
premium expectation
```

No animal candidate → journey may proceed.

---

## 34. Tests — escort selection

- Guard before Hunter;
- stable id tie-break;
- dead rejected;
- child/non-work-capable rejected;
- active incompatible Work Contract rejected;
- incompatible accompany rejected;
- away NPC rejected;
- no synthetic NPC created.

---

## 35. Tests — accompany regression

Existing:

```text
NPC → Player
```

must work unchanged.

New:

```text
NPC → NPC
```

uses same follow execution.

Save/load preserves:

- target NPC id;
- `world-party` source;
- stable party id.

No live object refs.

---

## 36. Tests — lifecycle

### Successful return

- escorts stop world-party commitment;
- same NPC identities resume ordinary settlement life.

### Guard death

- death persists;
- Merchant continues;
- no replacement.

### Merchant death

- escort commitments end;
- living escorts remain at current logical location;
- no automatic teleport/respawn.

---

## 37. Explicit non-goals

Nie implementować:

- settlement treasury/prosperity;
- Merchant P&L;
- trade-history progression;
- tier promotion/demotion;
- route-risk score;
- detailed road-following journey execution (`settlements-npcs-051`);
- party-local threat forwarding / escort combat cooperation (`settlements-npcs-051`);
- merchant cart/wagon journey;
- caravan formation;
- synthetic guard NPCs;
- new Guard profession;
- NPC→NPC wage contracts;
- equipment provisioning;
- journey preparation/resupply;
- camps/rest;
- journey failure evidence;
- Missing Merchant quest;
- wealth UI labels/badges.

---

## 38. Definition of done

Plan jest wykonany, gdy:

- każdy Trader ma deterministic derived `poor|normal|rich` tier;
- tier wynika z initial generated merchant context, nie mutable stock;
- canonical `offerValue/tradeValue` jest reused;
- thresholds są skalibrowane z deterministic assortment sweep, nie wymyślone ręcznie;
- settlement size ogranicza allowed tiers;
- premium assignment jest bounded signal, nie automatycznym `rich`;
- tier nie wymaga persistence;
- travel profile jest derived;
- poor preferuje donkey→horse i ma 0 escorts;
- normal preferuje horse→donkey i ma max 1 escort;
- rich preferuje horse→donkey i ma max 2 escorts;
- pack assignment reuse `settlements-npcs-048`;
- cargo nadal wynika z realnego transport capacity;
- Guard/Hunter są V1 escort candidates;
- generic accompany obsługuje NPC target;
- generic `world-party` source nie jest merchant-specific;
- escorts są realnymi persistent NPC;
- no unavailable party member is spawned;
- equipment expectation nie mintuje ani nie provisionuje gearu;
- `npc-053` pozostaje authority dla actual equipment use;
- prosperity/trade-success/history-based route-risk pozostają future inputs;
- party identity/escort commitments są wystarczająco actor-neutral, aby `settlements-npcs-051` mógł reuse istniejącego threat/combat arbitration bez nowego Merchant combat systemu.

Manualne/browser gameplay verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
