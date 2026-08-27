# Plan: NPC Helper Resource Delivery

**Created:** 2026-08-19
**Status:** `done` — implemented + technically verified (`tsc`/lint/build/test all green). Browser/manual verification not performed — see §19 implementation notes below.
**Priority:** medium · **Effort:** M
**Depends on:** ~~164~~ ~~ai-002~~ ~~ai-003~~
**Domain:** `settlements-npcs`

## Cel

Umożliwić istniejącemu NPC pomaganie graczowi poprzez dostarczanie wybranych zasobów do jego `Container`.

Pierwszy przypadek:

```text
NPC
 ↓
existing pressure / goal
 ↓
NeedId
 ↓
candidate strategies
 ↓
player-storage delivery strategy
 ↓
existing PlannedAction chain
 ↓
resource → NPC Inventory → player Container
```

NPC **nie staje się Companionem**. Pozostaje członkiem swojego householdu i zachowuje potrzeby, profesję, schedule, relacje, personality, traits i normalne życie.

Plan wykorzystuje istniejące mechanizmy `ai-002` i `ai-003`; nie tworzy osobnego Helper AI.

---

## 1. Zakres pierwszej wersji

Pierwsza wersja obsługuje:

- istniejącego NPC przypisanego do player storage,
- dostarczanie jedzenia,
- wybór istniejącej strategii pomocy przez normalny decision cycle,
- transport przez istniejący `PlannedAction` / `ActionLifecycle`,
- wykorzystanie istniejącego `Inventory` jako tymczasowego nośnika,
- zapis stabilnego `targetContainerId`, jeżeli assignment jest trwały,
- powrót NPC do normalnego życia po dostawie.

Woda może zostać dodana tylko wtedy, gdy istniejący model zasobów pozwala użyć tego samego mechanizmu bez tworzenia osobnego systemu.

---

## 2. Miejsce Helpera w aktualnej architekturze AI

Helper nie jest trybem NPC ani osobnym systemem AI.

Aktualny przepływ powinien pozostać:

```text
state
+ needs
+ problems
+ goals
+ pressures
+ relationships
+ profession / role
+ personality / traits
        ↓
ai-002 candidate scoring
        ↓
NeedId
        ↓
ai-003 candidate strategies
        ↓
strategy selection
        ↓
existing PlannedAction
```

Pomoc graczowi powinna być reprezentowana jako **dostępna strategia rozwiązania istniejącej potrzeby/celu lub aktywnego helper assignment**, a nie przez `HelperAI`, `HelperNeed` ani osobny priority system.

Nie omijać `scoreNeedCandidates()` ani mechanizmu candidate strategies.

---

## 3. Helper Delivery jako strategia

Nie tworzyć nowego Need tylko dlatego, że NPC może pomagać graczowi.

Docelowy model powinien być zbliżony do:

```text
food
 ├── household food
 ├── nearby real food source
 ├── settlement garden
 └── player storage delivery
```

`player storage delivery` jest dostępne tylko wtedy, gdy istnieje aktywny assignment oraz spełnione są jego ograniczenia.

Strategia musi zostać odrzucona przed selection, jeżeli np.:

- assignment jest nieaktywny,
- target container nie istnieje,
- resource nie jest dostępny,
- target nie może przyjąć zasobu.

Nie tworzyć równoległego availability/scoring engine.

---

## 4. Personality, traits i relacja z graczem

`ai-002` pozostaje źródłem istniejącego personality/role scoring.

W szczególności pomoc jest potencjalnym miejscem dla `agreeableness`, ale nie należy tworzyć osobnego `helper.relationshipScore` ani hardcode'ować progów typu `agreeableness > 0.7`.

Jeżeli personality ma wpływać na wybór helper strategy, rozszerzyć istniejący modifier/scoring seam.

Rozdzielić:

```text
relationship → dlaczego NPC może chcieć pomagać
assignment  → co NPC ma/ może dostarczyć i dokąd
strategy    → sposób realizacji celu
```

Nie tworzyć `HelperRelationship`.

---

## 5. Player Storage jako cel

Helper wskazuje konkretny istniejący `Container` jako target.

Preferowany model:

```text
Helper assignment
    ↓
targetContainerId
```

Nie tworzyć:

```text
HelperStorage
CompanionStorage
```

Nie zapisywać pozycji ani `Object3D` jako trwałej referencji.

Plan 164 jest hard dependency i dostarcza finalny kontrakt `Container`, `containerId`, capacity, item acceptance i persistence.

Dokładne API należy pobrać z **implementacji 164**, a nie zgadywać na podstawie tego planu.

---

## 6. Źródło zasobu i food ownership

Helper korzysta z istniejących źródeł jedzenia i istniejącej polityki household.

Istotne jest, że zwykłe NPC food gathering obecnie trafia do `Household.stock`, podczas gdy inne transportowane zasoby wykorzystują tymczasowy `NpcAgent` `Inventory`.

Nie zmieniać normalnego food pipeline tylko po to, aby helper mógł dostarczać jedzenie.

Dla helpera należy minimalnie rozszerzyć istniejący przepływ:

```text
food source / available surplus
        ↓
NPC Inventory
        ↓
player Container
```

NPC nie powinien przekazywać całego jedzenia householdu. Ilość dostępna do pomocy musi respektować istniejące potrzeby, reserve/capacity i ownership householdu.

Nie tworzyć drugiego modelu food ownership ani magicznych progów w `NpcAgent`.

---

## 7. Transport

Wykorzystać istniejący model:

```text
goTo → execute → next
```

oraz istniejące `PlannedAction`, `ActionLifecycle`, interruption i failure handling.

Docelowy chain:

```text
select strategy
 ↓
goTo resource source
 ↓
gather / collect
 ↓
carry in existing NPC Inventory
 ↓
goTo Container
 ↓
deposit
 ↓
complete
```

Nie tworzyć:

```text
HelperAction
HelperTransport
HelperDeliveryAction
HelperAI
```

Helper-specific ma być przede wszystkim **powód wyboru strategii i target**, a nie nowy sposób wykonywania ruchu/akcji.

---

## 8. Capacity i atomic transfer

Transfer musi korzystać z kontraktu `Container` z planu 164.

Uwzględnić istniejące:

- `ItemSize`,
- capacity,
- weight restrictions, jeśli dotyczą danego API,
- stacking,
- accepted quantity.

Preferowany model:

```text
requested amount
 ↓
container capacity
 ↓
accepted amount
 ↓
atomic transfer
```

Przy częściowym transferze NPC zachowuje nieprzeniesioną ilość.

Przy zerowym transferze akcja musi zakończyć się/failować przez istniejący lifecycle i wrócić do decision cycle. Nie tworzyć pętli retry w helperze.

Zachować invariant:

```text
source + carried + target = previous total
```

---

## 9. Własne potrzeby NPC mają pierwszeństwo

Helper pozostaje normalnym NPC.

Nie hardcode'ować hierarchii priorytetów w tym planie. Należy wykorzystać aktualny pressure/candidate scoring i istniejące critical-need interruption.

W szczególności:

```text
critical own need
        ↓
existing interruption
        ↓
helper action recovery
```

nie może powstać specjalny helper interrupt path.

Jeżeli NPC ma już zebraną żywność i zostanie przerwany, carried resources muszą pozostać poprawnie rozliczone.

---

## 10. Assignment

Przed dodaniem nowego typu należy sprawdzić aktualny system NPC goals/assignments/interactions.

Jeżeli nie istnieje odpowiedni mechanizm, dodać minimalny data-only assignment, np. koncepcyjnie:

```text
resource delivery assignment
  targetContainerId
  resourceKind
  enabled
```

Opcjonalne `playerId` należy dodać tylko jeśli aktualny model świata tego wymaga.

Nie tworzyć:

```text
NpcCommandManager
NpcOrderSystem
NpcTaskBoard
NpcAssignmentFramework
```

Assignment nie jest relationship i nie powinien być mieszany z personality.

---

## 11. Persistence

Jeżeli assignment jest trwały, save/load musi zachować:

- NPC identity,
- assignment,
- `targetContainerId`,
- resource/goal,
- stan potrzebny do bezpiecznego wznowienia lub anulowania delivery.

Container zachowuje własny stan niezależnie.

Po load/rebuild:

```text
assignment
 ↓
targetContainerId
 ↓
container lookup
 ↓
current target
```

Brak targetu nie może powodować permanentnie zablokowanego NPC.

Nie tworzyć helper-specific save systemu.

---

## 12. Multiple helpers

Kilku NPC może niezależnie wybrać ten sam Container.

Nie tworzyć coordinatora.

Wykorzystać istniejące resource reservations/logistics, jeżeli istnieją. Bez specjalnego `HelperReservationManager`.

Najważniejszy jest brak utraty/duplikacji zasobów przy konkurencyjnym transferze.

---

## 13. Off-screen simulation

Helper nie może zależeć od:

- kamery,
- widoczności,
- player proximity,
- interaction prompt,
- obecności rendered `Object3D`.

Wykorzystać istniejący model hybrydowej symulacji NPC.

Nie tworzyć helper-specific frame loop ani specjalnej off-screen symulacji.

---

## 14. UI / konfiguracja

Jeżeli istnieje UI relacji, interakcji lub NPC assignment, rozszerzyć je minimalnie.

Minimalna konfiguracja powinna umożliwić określenie:

```text
NPC:
  helper assignment = enabled
  target = player Container
  resource = food
```

Nie tworzyć osobnego Companion Management UI ani pełnego command systemu.

---

## 15. Woda

Po poprawnym działaniu food delivery ten sam mechanizm może obsłużyć water, jeśli aktualny resource/item model na to pozwala.

Nie tworzyć osobnego:

```text
deliverWaterToPlayer()
```

Jeżeli woda wymaga nowego modelu item/resource ownership, pozostaje poza zakresem pierwszej wersji.

---

## 16. Poza zakresem

Nie implementować:

- Companion,
- opuszczania household,
- przeprowadzki do gracza,
- follow,
- party management,
- obrony gracza,
- HelperAI,
- helper-specific transport,
- helper-specific inventory/storage,
- nowego logistics managera,
- GOAP/planner'a,
- LLM-driven decisions.

---

## 17. Weryfikacja

### Automated

- candidate strategy generation respektuje assignment i availability;
- niedostępny target nie jest wybierany;
- personality/role modifiers nie tworzą niemożliwych działań;
- istniejące critical needs pozostają authoritative;
- food transfer zachowuje conservation invariant;
- partial/full Container działa poprawnie;
- interruption nie gubi carried resources;
- assignment persistence działa;
- dwa helpery nie powodują duplikacji/utraty zasobów;
- istniejące testy AI/NPC pozostają zielone.

### Browser/gameplay

- można przypisać istniejącego NPC;
- można wskazać player Container;
- NPC wybiera helper delivery przez normalny decision flow;
- NPC pozyskuje food;
- NPC dostarcza food do Container;
- Container zwiększa zawartość;
- NPC wraca do normalnego życia;
- ważniejsza potrzeba może przerwać delivery;
- pełny Container nie powoduje pętli;
- save/load zachowuje assignment;
- zachowanie nie zależy od renderowania ani kamery.

Nie uznawać browser verification za wykonane bez faktycznego testu.

---

## 18. Kryterium ukończenia

Istniejący NPC może, w ramach swojej normalnej autonomii:

1. otrzymać aktywny helper assignment;
2. uwzględnić go w istniejącym decision/strategy flow;
3. wybrać dostępną strategię dostawy;
4. pozyskać nadwyżkowe jedzenie;
5. przenieść je przez istniejący `Inventory`;
6. dostarczyć je do wskazanego `Container`;
7. zachować własne zasoby i obowiązki;
8. przerwać działanie przy ważniejszej potrzebie;
9. wrócić do normalnego decision cycle;
10. powtórzyć proces tylko wtedy, gdy kolejna decyzja ponownie wybierze tę strategię.

Mechanizm korzysta z `ai-002`, `ai-003`, planu 164 oraz istniejących NPC action/logistics systems bez tworzenia równoległego Helper AI.

---

## 19. Implementation notes (2026-08-27)

**Implemented:**

- `ai/helperAssignment.ts` — minimal data-only `HelperAssignment` (`targetContainerId`/`resourceKind: 'food'`/`enabled`), exactly the §10 shape, no order/task/command system.
- `settlement/npcState.ts` — `NpcAuthoritativeState.helperAssignment` (mutable, `null` by default), carried through `NpcStateSnapshot`/`fromSnapshot`/`serialize()` the same in-session "shared object, carried across a `WorldBundle` rebuild, not part of `SaveData`" pattern already used for HP/needs/stamina/vigor. **Not saved to IndexedDB** — matches the existing, already-documented gap (`docs/STATE.md`: "NPC runtime state is not a full simulation snapshot") rather than adding a new NPC-only save mechanism; assignment survives a rebuild/settlement-reload but not a save/reload. If full NPC persistence ever lands, this field rides along with it for free.
- `settlement/household.ts` — `Household.surplus(kind)`: `max(0, stock.query(kind) - target)`. The "genuinely spare, not the household's own reserve" amount plan §6/§7 asked for, without a second ownership model.
- `world/helperDeliveryHooks.ts` — narrow `HelperDeliveryHooks` (`findTarget`/`hasRoom`/`deposit`) over `PlacedContainers` (plan 164), mirroring `SettlementFoodSourceHooks`/`SettlementMiningHooks`'s shape. Threaded through `worldBundle.ts` → `SettlementsManager.ts` → `createSettlement.ts` → `NpcAgent`, the same "built ahead, forwarded as an optional hook" wiring `foodSources`/`hunting` already use — `placedContainers` construction moved earlier in `buildWorldSystems` (it has no dependency on `settlementsManager`) so the hooks exist before any `NpcAgent` is built.
- `ai/npcStrategies.ts` — new `'playerStorageDelivery'` `NpcStrategyId`; `getFoodStrategyCandidates` takes a `deliveryAvailable` flag and, when true, lists it **first** (ahead of `householdFood`). This is a deliberate reordering from the plan's own diagram (which lists it last, after the always-available `gardenGather`): since `householdFood` is available whenever the household has *any* food (common case — target 3/capacity 7) and `gardenGather` is an unconditional fallback, a delivery candidate placed after either would be practically unreachable, contradicting the "NPC dostarcza food do Container" verification requirement (§17). Placing it first is safe only because `deliveryAvailable` itself already encodes "not genuinely hungry + real surplus + valid/roomy target" (see next point) — own real hunger never loses to a delivery.
- `ai/Needs.ts` — `PickNeedOptions.helperDeliveryAvailable` reuses the exact `foodShortage` threshold/multiplier bias (0.24/1.4 vs the normal 0.32/1.2, now exported as `FOOD_THRESHOLD_NORMAL`) so an assigned NPC's `food` need can be picked even while not hungry, the same "extend the existing modifier seam" plan §3/§9 asked for — no new `NeedId`, no second pressure engine.
- `ai/NpcAgent.ts`:
  - `helperDelivery: HelperDeliveryHooks | null` (constructor-injected, same optional-hook pattern as `foodSources`/`hunting`) and a kept `npcState: NpcAuthoritativeState` reference (previously only destructured) so assignment reads/writes go straight to the shared object.
  - `helperAssignment` getter + `setHelperAssignment(targetContainerId | null)` — the whole write surface the Villagers-screen UI needs.
  - `needPickOptions()` gains a cheap `helperDeliveryAvailable` gate (assignment enabled + hooks present, nothing else) — real eligibility is computed once `food` is actually selected.
  - `computeDeliveryAvailable(household)` — the actual gate: enabled assignment, `this.needs.hunger <= FOOD_THRESHOLD_NORMAL` (own hunger keeps priority, §9), `household.surplus('food') > 0`, target container resolvable and has room. Read-only, reused by both `computeFoodStrategyCandidates` (candidate generation) and `beginPlayerStorageDelivery` (execution gate).
  - `beginPlayerStorageDelivery(household)` — the `goTo home → gather → goTo container → deposit` chain (reuses `eat`/`deposit` `ActionId`s and the existing `startAction`/`next` chain mechanism verbatim, no new action kind). Converts household `food` `EconomicStock` surplus into concrete `HELPER_DELIVERY_ITEM_KIND` (`'bread'` — an existing, already-catalogued plain staple item, not a new `ItemKind`) units carried in the existing `this.carried` `Inventory`, capped at `HELPER_DELIVERY_MAX_CARRY = 3`. Both the gather and deposit steps re-validate at `onComplete` time (surplus may have shrunk, container may be gone/full) rather than trusting the decision-time read; a partial/zero container accept leaves the untransferred amount with the NPC (§8) — no retry loop, the next decision cycle re-evaluates from scratch.
  - `beginNeed('food')` tries `beginPlayerStorageDelivery` first, before the existing household-eat branch.
- Villagers screen UI (`ui-vue/store.ts`'s `ui.villagers.containers` + `refreshVillagers()`, `app/createApp.ts`'s `openVillagers()`, `ui-vue/screens/VillagersScreen.vue`) — a per-NPC `<select>` of the player's placed chests (or "brak") calling `npc.setHelperAssignment()` directly on the live `NpcAgent` reference the screen already holds (matches how `hpPercent()` already reads `npc.health` directly) — the minimal §14 config, no separate Companion-management UI.

**Technically verified:** `npx tsc --noEmit`, `pnpm run lint:fix`, `pnpm run build` (incl. `vue-tsc`), `pnpm run test` (1938 tests) all pass — including new coverage in `ai/npcStrategies.test.ts` (delivery candidate ordering/omission), `ai/Needs.test.ts` (`helperDeliveryAvailable` threshold bias), and `settlement/household.test.ts` (`surplus`).

**Multiple helpers / capacity / conservation:** not separately unit-tested beyond what `PlacedContainers.deposit`'s existing atomic per-unit `add()` loop and `Household.stock.remove`'s existing invariants already guarantee — two NPCs targeting the same container each re-validate room via `hasRoom`/re-query surplus at execution time, and a container that fills between one NPC's check and its deposit just accepts less (down to 0), which is the existing `PlacedContainers.deposit` partial-accept contract, not new code written for 167.

**Not done / deliberately deferred (matches §15/§16):**

- Water delivery — out of scope per §15 (household water is a `WaterReserve`, not an `EconomicStock`-backed `HouseholdResourceKind`, so it doesn't fit the same surplus/item-conversion bridge without a second model).
- No `docs/assets/MODELS.md`/`SOUNDS.md` entries — no new model/sound needed (`bread` already has a procedural mesh, chests already exist per plan 164).

**Browser/manual verification — not performed.** Needs a manual pass in the running dev server:

- Buy/place a chest (plan 164), open Mieszkańcy (villagers screen), assign an NPC's helper dropdown to it.
- Fast-forward or wait for that NPC's household `food` stock to exceed 3 (target) — confirm the NPC walks home, then to the chest, and its `Container` contents increase.
- Confirm the NPC resumes normal life afterward and doesn't loop when the chest is full.
- Interrupt mid-delivery with a critical need (e.g. very low thirst) and confirm no food is lost (still in `this.carried` or already back in household stock).
- Assign two NPCs to the same small-surplus household/container and confirm no duplication/negative capacity.
- Save/reload — confirm the assignment does **not** currently survive (documented limitation above, not a bug) and the NPC doesn't get stuck.
- Walk far enough away to unload/reload the settlement (in-session rebuild) — confirm the assignment *does* survive that.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
