# Plan: Merchant journey provisioning and readiness

**Created:** 2026-09-18
**Status:** `draft` 📝
**Priority:** high · **Effort:** L
**Depends on:** settlements-npcs-048, settlements-npcs-049, fauna-039, npc-053
**Domain:** `settlements-npcs`
**Type:** `feature`
**Roadmap:** `quests-travelling-merchant-journeys.md`

## Goal

Przed rozpoczęciem realnej podróży Travelling Merchant ma ocenić gotowość własnej party i przygotować się z użyciem istniejących systemów zasobów, ekwipunku, potrzeb i transportu.

Target:

```text
journey opportunity
→ party/profile already resolved
→ estimate bounded journey needs
→ inspect real current state
→ acquire/prepare what is missing
→ depart when sufficiently ready
OR
→ delay/cancel when preparation cannot be completed
```

Nie tworzyć `MerchantPreparationInventory`, `MerchantFood`, `MerchantWater` ani osobnego preparation managera.

---

## 1. Scope

Readiness powinno obejmować co najmniej:

- food provisions;
- drinking water;
- usable personal weapon;
- weapon sharpness/condition where relevant;
- real pack animal / transport required by active journey profile;
- pack/cart capacity and cargo readiness;
- escort availability/readiness when profile expects escorts.

Detailed overnight camp/rest remains outside this plan.

---

## 2. Existing systems to reuse

Implementation recon przed promocją do `planned` ma potwierdzić finalne seams dla:

- NPC personal provisions / survival;
- household and settlement item/resource access;
- water filling;
- weapon maintenance / whetstone;
- `npc-053` equipment choice;
- `fauna-039` real pack equipment/inventory;
- `settlements-npcs-048` pack-animal assignment/journey continuity;
- `settlements-npcs-049` merchant travel profile;
- `TransportOrder` cargo ownership/loading;
- escort/accompany commitments.

Nie duplikować żadnego z tych stanów.

---

## 3. Readiness model

Preferować pure resolver:

```ts
type MerchantJourneyReadiness = {
  ready: boolean
  shortages: readonly JourneyPreparationShortage[]
}
```

Shortage opisuje realny brak, nie nowy pressure store.

Candidate categories:

```text
food
water
weapon
weapon_maintenance
pack_transport
cargo_capacity
escort
```

Exact shape dopiero po reconie aktualnych ownerów.

---

## 4. Bounded provisioning estimate

Estimate ma zależeć od:

- expected travel duration/distance already available to journey continuity;
- merchant + escort count;
- existing personal provisions;
- current transport profile.

Nie próbować symulować całej podróży podczas przygotowania.

Nie dodawać drugiego ETA/routera.

---

## 5. Preparation actions

Realne przygotowanie może obejmować:

- pobranie legalnego food z own household / settlement source;
- napełnienie istniejącego liquid container przy legalnym water source;
- ostrzenie posiadanej broni przy użyciu realnego whetstone;
- uzupełnienie sensownego wyposażenia tylko przez istniejące ownership/resource mechanisms;
- założenie / sprawdzenie realnych saddlebags;
- załadowanie realnego pack/cart cargo;
- finalne potwierdzenie escort commitments.

Każda akcja ma posiadać normalny owner i normalną mutację świata.

---

## 6. No magic resupply

Jeżeli zasobów nie ma:

```text
no food → no invented food
no water container/source → no invented water
no whetstone → no instant sharpening
no pack animal → no synthetic animal
no escort → no disposable guard
```

Journey może:

- wyjechać z degraded profile tylko jeżeli wcześniejsze plany jawnie to dopuszczają;
- zostać odłożona;
- zostać anulowana.

Final policy wymaga reconu 048/049.

---

## 7. Preparation ownership

Preferowany boundary:

```text
merchant journey start orchestration
→ readiness resolver
→ existing actor/world actions
→ revalidate
→ commit departure
```

Nie trzymać drugiej kopii stanu przygotowania, jeżeli można go derive z inventory/animal/order/commitments.

Persistować tylko to, co jest potrzebne do continuity przerwanego preparation episode.

---

## 8. Interruption

Needs, combat, weather/shelter i inne stronger NPC pressures mogą przerwać przygotowanie.

Po wznowieniu:

```text
re-read real state
→ continue missing preparation only
```

Nie restartować już wykonanych realnych transferów.

---

## 9. Cargo integration

Plan ma ustalić po reconie, jak realny shipment przechodzi z obecnego transport ownership do pack/cart representation.

Nie kopiować cargo.

Invariant:

```text
one physical shipment quantity
one authoritative owner at every stage
```

---

## 10. Success / failure outcome

Departure commit następuje dopiero po finalnej rewalidacji:

```text
journey still valid
party still valid
required transport still valid
minimum provisions still valid
cargo ownership valid
→ depart
```

Jeżeli commit fails, nie zostawia orphan escort/animal/cargo reservation.

---

## 11. Recon required before planned

Przed promocją do `planned` sprawdzić:

- final code po implementacji 048/049/053/039;
- current personal-provision estimate API;
- legal household/settlement provisioning sources;
- current water-container fill action;
- weapon maintenance call boundary;
- whether preparation needs persisted episode state;
- exact rollback semantics at journey start;
- whether pack/cart cargo is physically loaded in this plan or later integration.

---

## 12. Explicit non-goals

Nie implementować:

- overnight travel camp;
- route encounters;
- merchant death evidence;
- Missing Merchant quest;
- dynamic route-risk model;
- shopping AI/economic procurement market;
- magic merchant restock;
- new inventory type.

---

## 13. Draft verification direction

Future automated/manual coverage should prove:

- sufficient resources → real preparation → departure;
- missing resource never mints value;
- interruption resumes from real state;
- no duplicate cargo;
- no duplicate escort/animal assignment;
- save/rebuild during preparation does not duplicate transfers;
- departure happens only after final readiness revalidation.

Manualne/browser gameplay verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
