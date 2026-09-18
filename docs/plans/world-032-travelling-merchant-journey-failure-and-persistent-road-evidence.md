# Plan: Travelling Merchant journey failure and persistent road evidence

**Created:** 2026-09-18
**Status:** `draft` 📝
**Priority:** high · **Effort:** L
**Depends on:** settlements-npcs-048, settlements-npcs-050, fauna-039
**Domain:** `world`
**Type:** `feature`
**Roadmap:** `quests-travelling-merchant-journeys.md`

## Goal

Realna porażka Travelling Merchant journey ma pozostawić persistent, discoverable world evidence niezależnie od tego, czy Player obserwował zdarzenie i czy jakikolwiek quest został uruchomiony.

Target:

```text
real journey
→ real death/failure
→ journey no longer completes normally
→ corpse / dead escorts / animal / cart / cargo / personal evidence remain
→ world persists consequence
→ later systems may discover it
```

Quest nie może być źródłem śladów.

---

## 1. Evidence comes from real ownership

Nie spawnujemy questowych atrap.

Evidence może pochodzić z:

- merchant corpse/post-death state;
- dead escort NPCs;
- dead pack animal;
- `fauna-039` ground saddlebags/cargo handoff;
- abandoned/damaged real cart;
- real shipment cargo;
- merchant personalInventory/corpse loot;
- existing `signet_ring`;
- compact failure facts needed for later discovery/cause attribution.

---

## 2. Failure boundary

Plan ma ustalić canonical transition:

```text
active merchant journey
→ terminal journey failure
```

bez:

- teleportowania cargo do destination;
- teleportowania merchant/party do home;
- automatycznego respawnu po stream/reload;
- tworzenia drugiego merchant identity.

---

## 3. Merchant death

Merchant death korzysta z normalnego NPC death/post-death lifecycle.

Nie tworzyć merchant-specific corpse.

Real personal items pozostają w normalnym loot ownership path.

Existing `signet_ring` powinien być realnym itemem, jeżeli Merchant go posiada.

---

## 4. Escort death

Escort to realny NPC.

Śmierć:

- kończy jego udział w party;
- nie spawnuje replacementu;
- zachowuje normalny corpse/loot lifecycle;
- nie blokuje sama z siebie persistence pozostałych śladów.

---

## 5. Animal death

Pack animal używa normalnego fauna death lifecycle.

Jeżeli ma realne juki/cargo, `fauna-039` jest authority dla handoff na ground saddlebags container.

Ten plan nie tworzy drugiego animal cargo-drop mechanism.

---

## 6. Cart / abandoned transport

Jeżeli journey używa cart:

- cart identity ma pozostać realna;
- po utracie operatora/party nie może teleportować się home;
- damage/abandonment semantics wymagają reconu current cart lifecycle.

Nie dodawać fake wreck prop, jeśli real cart może reprezentować consequence.

---

## 7. Shipment cargo

Failure musi zachować conservation:

```text
source - picked up quantity
=
cargo still carried / in pack / cart / dropped/recoverable
+ delivered quantity
```

Brak destination credit po śmierci przed dostawą.

Exact handoff zależy od final 048/050 cargo ownership.

---

## 8. Failure evidence record

Może być potrzebny mały compact persistent fact opisujący zdarzenie, ale nie może kopiować fizycznego stanu.

Candidate:

```ts
type JourneyFailureEvidence = {
  journeyId: string
  merchantNpcId: string
  occurredAtDays: number
  x: number
  z: number
  cause?: ...
}
```

To tylko provenance/discovery fact, jeśli current physical owners nie potrafią odtworzyć wymaganych informacji.

Nie kopiować tam cargo/items/corpse state.

---

## 9. Cause

Cause powinno wynikać z realnego zdarzenia, gdy jest dostępne:

- predator/animal attack;
- NPC/bandit combat;
- environmental/survival failure;
- unknown.

Nie zgadywać przy braku authority.

Later quest może raportować `unknown`.

---

## 10. Signet ring

Preferowany flow:

```text
merchant owns existing signet_ring
→ merchant dies
→ signet enters normal corpse loot
→ later recovery uses exact same item
```

Nie tworzyć:

```text
merchantQuestRing
missingMerchantRing
```

---

## 11. Optional predator evidence transfer

Roadmap dopuszcza scenariusz, gdzie scavenger/predator zabiera selected evidence.

To jest optional follow-up w ramach tego planu tylko po reconie fauna corpse feeding.

Nie budować universal digestive inventory.

Jeżeli brak czystego ownership seam, zostawić signet przy corpse zamiast tworzyć sztuczny wyjątek.

---

## 12. Persistence without quest

Evidence musi przeżyć:

- settlement stream-out/in;
- world rebuild;
- save/load;
- brak Playera w pobliżu;
- brak aktywnego questa.

Discovery quest może powstać później.

---

## 13. Reconciliation

Plan ma zapewnić idempotentne reconciliation terminal failure:

```text
journey already failed
→ never deliver again
→ never recreate cargo
→ never respawn dead party
→ never duplicate evidence
```

Stable journey/entity IDs powinny być podstawą.

---

## 14. Recon required before planned

Przed promocją sprawdzić:

- final journey record/state after 048/050;
- current NPC death/post-death persistence;
- transport-order failure semantics;
- current cart persistence/damage/ownership;
- fauna-039 ground pack semantics after implementation;
- exact source of combat/cause attribution;
- whether a dedicated failure-evidence record is necessary;
- how remote/off-screen death currently materializes position/evidence.

---

## 15. Explicit non-goals

Nie implementować:

- Missing Merchant quest;
- family reaction/dialogue;
- route-risk scoring;
- dangerous-route world consequence;
- bandit system if it does not already exist;
- quest-only corpse/cart/cargo;
- universal evidence inventory.

---

## 16. Draft verification direction

Future coverage:

- merchant dies detailed → journey terminal + real evidence;
- merchant dies off-screen → same logical consequence;
- cargo not delivered;
- signet remains recoverable if owned;
- pack animal death reuses fauna-039;
- save/load does not duplicate party/evidence;
- quest absence does not delete evidence;
- later discovery reads real state.

Manualne/browser gameplay verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
